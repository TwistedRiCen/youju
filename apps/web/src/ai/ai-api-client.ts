import {
  isAiTaskOutput,
  toWireInputManifest,
  type AiTaskOutput,
  type AiTaskType,
  type InputManifest,
  type ProviderCapabilities,
  type ProviderErrorCode,
  type ProviderPreset,
  type AiProtocol,
} from '@youju/ai-core'
import type { UuidV4 } from '@youju/domain'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

const PROVIDER_ERROR_CODES: readonly ProviderErrorCode[] = [
  'provider_auth_failed',
  'provider_model_not_found',
  'provider_rate_limited',
  'provider_quota_exceeded',
  'provider_content_rejected',
  'provider_unreachable',
  'provider_timeout',
  'provider_response_too_large',
  'provider_capability_missing',
  'target_not_allowed',
  'invalid_structured_output',
  'repair_failed',
  'request_cancelled',
  'task_already_running',
]

export interface ConnectionTestRequest {
  readonly requestId: UuidV4
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrl?: string
  readonly modelName: string
  readonly apiKey: string
  readonly capabilities: ProviderCapabilities
}

export interface ConnectionTestResult {
  readonly requestId: UuidV4
  readonly capabilities: ProviderCapabilities
  readonly usage: TokenUsage | null
  readonly providerRequestIdFingerprint: string | null
}

export interface AiTaskImageInput {
  readonly sourceToken: string
  readonly bytes: Uint8Array
}

export interface AiTaskRequest {
  readonly requestId: UuidV4
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrl?: string
  readonly modelName: string
  readonly apiKey: string
  readonly capabilities: ProviderCapabilities
  readonly manifest: InputManifest
  readonly inputText?: string
  readonly images: readonly AiTaskImageInput[]
}

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
}

export interface AiTaskResult {
  readonly requestId: UuidV4
  readonly taskType: AiTaskType
  readonly output: AiTaskOutput
  readonly usage: TokenUsage | null
  readonly repairAttempted: boolean
  readonly providerRequestIdFingerprint: string | null
}

export interface AiApiClient {
  testConnection(request: ConnectionTestRequest, signal: AbortSignal): Promise<ConnectionTestResult>
  executeTask(request: AiTaskRequest, signal: AbortSignal): Promise<AiTaskResult>
}

export interface AiApiClientOptions {
  readonly fetch?: typeof fetch
  readonly origin?: string
}

export class AiApiClientError extends Error {
  readonly code: ProviderErrorCode

  constructor(code: ProviderErrorCode) {
    super(code)
    this.name = 'AiApiClientError'
    this.code = code
  }
}

function isProviderErrorCode(value: unknown): value is ProviderErrorCode {
  return typeof value === 'string' && PROVIDER_ERROR_CODES.includes(value as ProviderErrorCode)
}

function responseErrorCode(status: number, body: unknown): ProviderErrorCode {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error
    if (typeof error === 'object' && error !== null && !Array.isArray(error)) {
      const code = (error as Record<string, unknown>).code
      if (isProviderErrorCode(code)) {
        return code
      }
    }
  }
  switch (status) {
    case 401: return 'provider_auth_failed'
    case 402: return 'provider_quota_exceeded'
    case 404: return 'provider_model_not_found'
    case 409: return 'task_already_running'
    case 429: return 'provider_rate_limited'
    case 499: return 'request_cancelled'
    case 504: return 'provider_timeout'
    default: return 'provider_unreachable'
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

async function readJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new AiApiClientError('provider_response_too_large')
  }
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new AiApiClientError('provider_response_too_large')
  }
  return safeJson(text)
}

function requestBody(request: ConnectionTestRequest | AiTaskRequest): Record<string, unknown> {
  return {
    requestId: request.requestId,
    providerPreset: request.providerPreset,
    protocol: request.protocol,
    ...(request.baseUrl === undefined ? {} : { baseUrl: request.baseUrl }),
    modelName: request.modelName,
    apiKey: request.apiKey,
    capabilities: request.capabilities,
  }
}

function toTaskBody(request: AiTaskRequest): Record<string, unknown> {
  return {
    ...requestBody(request),
    manifest: toWireInputManifest(request.manifest),
    ...(request.inputText === undefined ? {} : { inputText: request.inputText }),
    images: request.images.map((image) => ({
      sourceToken: image.sourceToken,
      dataUrl: `data:image/webp;base64,${toBase64(image.bytes)}`,
    })),
  }
}

function assertUsage(value: unknown): value is TokenUsage | null {
  if (value === null) return true
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const usage = value as Record<string, unknown>
  return ['inputTokens', 'outputTokens', 'totalTokens'].every((key) =>
    Number.isSafeInteger(usage[key]) && Number(usage[key]) >= 0,
  )
}

function assertFingerprint(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value)
}

function assertCapabilities(value: unknown): value is ProviderCapabilities {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const capabilities = value as Record<string, unknown>
  return ['text', 'vision', 'jsonMode', 'jsonSchema', 'streaming'].every((key) => typeof capabilities[key] === 'boolean')
}

function parseConnectionResult(request: ConnectionTestRequest, value: unknown): ConnectionTestResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AiApiClientError('invalid_structured_output')
  }
  const body = value as Record<string, unknown>
  if (body.requestId !== request.requestId || !assertCapabilities(body.capabilities) || !assertUsage(body.usage) || !assertFingerprint(body.providerRequestIdFingerprint)) {
    throw new AiApiClientError('invalid_structured_output')
  }
  return {
    requestId: request.requestId,
    capabilities: body.capabilities,
    usage: body.usage,
    providerRequestIdFingerprint: body.providerRequestIdFingerprint,
  }
}

function parseTaskResult(request: AiTaskRequest, value: unknown): AiTaskResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AiApiClientError('invalid_structured_output')
  }
  const body = value as Record<string, unknown>
  if (body.requestId !== request.requestId || body.taskType !== request.manifest.taskType || !isAiTaskOutput(request.manifest.taskType, body.output) || !assertUsage(body.usage) || typeof body.repairAttempted !== 'boolean' || !assertFingerprint(body.providerRequestIdFingerprint)) {
    throw new AiApiClientError('invalid_structured_output')
  }
  return {
    requestId: request.requestId,
    taskType: request.manifest.taskType,
    output: body.output,
    usage: body.usage,
    repairAttempted: body.repairAttempted,
    providerRequestIdFingerprint: body.providerRequestIdFingerprint,
  }
}

async function postJson<T>(
  input: { readonly path: string; readonly body: Record<string, unknown>; readonly signal: AbortSignal; readonly parse: (value: unknown) => T },
  fetcher: typeof fetch,
  origin: string,
): Promise<T> {
  if (input.signal.aborted) {
    throw new AiApiClientError('request_cancelled')
  }
  try {
    const response = await fetcher(`${origin}${input.path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
      redirect: 'error',
    })
    const body = await readJson(response)
    if (!response.ok) {
      throw new AiApiClientError(responseErrorCode(response.status, body))
    }
    return input.parse(body)
  } catch (error) {
    if (error instanceof AiApiClientError) throw error
    if (input.signal.aborted || error instanceof DOMException && error.name === 'AbortError') {
      throw new AiApiClientError('request_cancelled')
    }
    throw new AiApiClientError('provider_unreachable')
  }
}

export function createAiApiClient(options: AiApiClientOptions = {}): AiApiClient {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  const origin = options.origin ?? ''
  return {
    testConnection(request, signal) {
      return postJson({
        path: '/ai/connection-test',
        body: requestBody(request),
        signal,
        parse: (value) => parseConnectionResult(request, value),
      }, fetcher, origin)
    },
    executeTask(request, signal) {
      return postJson({
        path: `/ai/tasks/${request.manifest.taskType}`,
        body: toTaskBody(request),
        signal,
        parse: (value) => parseTaskResult(request, value),
      }, fetcher, origin)
    },
  }
}
