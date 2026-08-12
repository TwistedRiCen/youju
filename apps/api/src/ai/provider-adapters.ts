import { createHash } from 'node:crypto'
import {
  BuildTimelineWireOutputSchema,
  ClassifyEvidenceWireOutputSchema,
  DraftStatementWireOutputSchema,
  ExtractFactsWireOutputSchema,
  isAiTaskOutput,
  type AiProtocol,
  type AiTaskOutput,
  type AiTaskType,
  type ProviderCapabilities,
  type ProviderErrorCode,
  type WireInputManifest,
} from '@youju/ai-core'
import type { PinnedHttpsClient, PinnedHttpsResponse } from './pinned-https-client.js'
import { getPrompt, getTaskPrompt } from './prompt-catalog.js'

export interface DerivedImageInput {
  readonly sourceToken: string
  readonly dataUrl: string
}

export interface ConnectionTestRequest {
  readonly apiKey: string
  readonly modelName: string
  readonly capabilities: ProviderCapabilities
}

export interface ConnectionTestResult {
  readonly capabilities: ProviderCapabilities
  readonly usage: TokenUsage | null
  readonly providerRequestIdFingerprint: string | null
}

export interface AiTaskRequest {
  readonly apiKey: string
  readonly modelName: string
  readonly taskType: AiTaskType
  readonly manifest: WireInputManifest
  readonly inputText?: string
  readonly images: readonly DerivedImageInput[]
  readonly capabilities: ProviderCapabilities
}

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
}

export interface AiTaskResult {
  readonly output: AiTaskOutput
  readonly usage: TokenUsage | null
  readonly repairAttempted: boolean
  readonly providerRequestIdFingerprint: string | null
}

export interface AiProviderAdapter {
  testConnection(request: ConnectionTestRequest, signal: AbortSignal): Promise<ConnectionTestResult>
  executeTask(request: AiTaskRequest, signal: AbortSignal): Promise<AiTaskResult>
}

export class AiProviderError extends Error {
  readonly code: ProviderErrorCode

  constructor(code: ProviderErrorCode) {
    super(code)
    this.code = code
    this.name = 'AiProviderError'
  }
}

interface UpstreamEnvelope {
  readonly text: string
  readonly usage: TokenUsage | null
  readonly providerRequestIdFingerprint: string | null
}

interface StructuredOutputFailure {
  readonly kind: 'invalid_json' | 'invalid_schema'
}

const CONNECTION_IMAGE = 'data:image/webp;base64,UklGRg=='
const CONNECTION_TEXT = 'fictional connection test material'
const REPAIR_INSTRUCTION = 'Return only JSON that matches the named schema. Do not add facts, sources, or fields.'

const OUTPUT_SCHEMAS = {
  classify_evidence: {
    id: 'classify_evidence_output_v1',
    schema: ClassifyEvidenceWireOutputSchema,
  },
  extract_facts: {
    id: 'extract_facts_output_v1',
    schema: ExtractFactsWireOutputSchema,
  },
  build_timeline: {
    id: 'build_timeline_output_v1',
    schema: BuildTimelineWireOutputSchema,
  },
  draft_statement: {
    id: 'draft_statement_output_v1',
    schema: DraftStatementWireOutputSchema,
  },
} as const

function encodeBody(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function decodeJson(body: Uint8Array): unknown {
  const text = new TextDecoder().decode(body).trim()
  if (text.length === 0) {
    throw new AiProviderError('invalid_structured_output')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AiProviderError('provider_unreachable')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberProperty(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key]
  return typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 0
    ? candidate
    : undefined
}

function normalizeUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) {
    return null
  }
  const inputTokens = numberProperty(value, 'input_tokens') ?? numberProperty(value, 'prompt_tokens')
  const outputTokens = numberProperty(value, 'output_tokens') ?? numberProperty(value, 'completion_tokens')
  const totalTokens = numberProperty(value, 'total_tokens')
  if (inputTokens === undefined || outputTokens === undefined) {
    return null
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? inputTokens + outputTokens,
  }
}

function mergeUsage(first: TokenUsage | null, second: TokenUsage | null): TokenUsage | null {
  if (first === null) {
    return second
  }
  if (second === null) {
    return first
  }
  return {
    inputTokens: first.inputTokens + second.inputTokens,
    outputTokens: first.outputTokens + second.outputTokens,
    totalTokens: first.totalTokens + second.totalTokens,
  }
}

function fingerprintRequestId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function headerValue(response: PinnedHttpsResponse, name: string): string | null {
  const value = response.headers[name] ?? response.headers[name.toLowerCase()]
  if (typeof value === 'string') {
    return value
  }
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null
}

function responseText(value: unknown, protocol: AiProtocol): string | null {
  if (!isRecord(value)) {
    return null
  }
  if (protocol === 'responses') {
    const output = value.output
    if (!Array.isArray(output)) {
      return null
    }
    for (const item of output) {
      if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) {
        continue
      }
      for (const content of item.content) {
        if (isRecord(content) && content.type === 'output_text' && typeof content.text === 'string') {
          return content.text
        }
      }
    }
    return null
  }
  const choices = value.choices
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message) || typeof firstChoice.message.content !== 'string') {
    return null
  }
  return firstChoice.message.content
}

function extractEnvelope(response: PinnedHttpsResponse, protocol: AiProtocol): UpstreamEnvelope {
  const value = decodeJson(response.body)
  const text = responseText(value, protocol)
  if (text === null || text.trim().length === 0) {
    throw new AiProviderError('invalid_structured_output')
  }
  const usage = isRecord(value) ? normalizeUsage(value.usage) : null
  const requestId = isRecord(value)
    ? fingerprintRequestId(value.id)
    : null
  return {
    text,
    usage,
    providerRequestIdFingerprint: requestId ?? fingerprintRequestId(headerValue(response, 'x-request-id')),
  }
}

function mapStatus(statusCode: number): ProviderErrorCode | null {
  switch (statusCode) {
    case 401:
    case 403:
      return 'provider_auth_failed'
    case 402:
      return 'provider_quota_exceeded'
    case 404:
      return 'provider_model_not_found'
    case 408:
    case 504:
      return 'provider_timeout'
    case 413:
      return 'provider_response_too_large'
    case 429:
      return 'provider_rate_limited'
    case 400:
    case 422:
      return 'provider_content_rejected'
    default:
      return statusCode >= 500 ? 'provider_unreachable' : null
  }
}

function mapTransportError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) {
    return error
  }
  const message = error instanceof Error ? error.message : ''
  const knownCodes: readonly ProviderErrorCode[] = [
    'request_cancelled',
    'provider_timeout',
    'provider_response_too_large',
    'target_not_allowed',
  ]
  const knownCode = knownCodes.find((code) => message === code)
  return new AiProviderError(knownCode ?? 'provider_unreachable')
}

function schemaFor(taskType: AiTaskType) {
  return OUTPUT_SCHEMAS[taskType]
}

function responseFormat(request: Pick<AiTaskRequest, 'capabilities'>, taskType: AiTaskType): Record<string, unknown> {
  const schema = schemaFor(taskType)
  if (request.capabilities.jsonSchema) {
    return {
      type: 'json_schema',
      name: schema.id,
      strict: true,
      schema: schema.schema,
    }
  }
  return { type: 'json_object' }
}

function inputPayload(request: AiTaskRequest): Record<string, unknown> {
  return {
    taskType: request.taskType,
    manifest: request.manifest,
    ...(request.inputText === undefined ? {} : { inputText: request.inputText }),
  }
}

function imageContent(images: readonly DerivedImageInput[]): readonly Record<string, string>[] {
  return images.map((image) => ({
    type: 'input_image',
    image_url: image.dataUrl,
  }))
}

function buildResponsesRequest(
  modelName: string,
  prompt: { readonly system: string; readonly instruction: string },
  payload: unknown,
  images: readonly DerivedImageInput[],
  taskType: AiTaskType,
  capabilities: ProviderCapabilities,
): Record<string, unknown> {
  return {
    model: modelName,
    store: false,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: prompt.system }] },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `${prompt.instruction}\n<untrusted-material>${JSON.stringify(payload)}</untrusted-material>` },
          ...imageContent(images),
        ],
      },
    ],
    text: { format: responseFormat({ capabilities }, taskType) },
  }
}

function buildChatRequest(
  modelName: string,
  prompt: { readonly system: string; readonly instruction: string },
  payload: unknown,
  images: readonly DerivedImageInput[],
  taskType: AiTaskType,
  capabilities: ProviderCapabilities,
): Record<string, unknown> {
  const userContent = [
    { type: 'text', text: `${prompt.instruction}\n<untrusted-material>${JSON.stringify(payload)}</untrusted-material>` },
    ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } })),
  ]
  return {
    model: modelName,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: userContent },
    ],
    response_format: responseFormat({ capabilities }, taskType),
  }
}

function buildRepairPayload(taskType: AiTaskType, originalOutput: string): Record<string, string> {
  return {
    taskType,
    schemaId: schemaFor(taskType).id,
    originalOutput,
    repairInstruction: REPAIR_INSTRUCTION,
  }
}

function buildRepairRequest(
  protocol: AiProtocol,
  modelName: string,
  taskType: AiTaskType,
  originalOutput: string,
): Record<string, unknown> {
  const prompt = getPrompt('repair-structured-output-v1')
  const payload = buildRepairPayload(taskType, originalOutput)
  if (protocol === 'responses') {
    return buildResponsesRequest(modelName, prompt, payload, [], taskType, { jsonSchema: true, text: true, vision: false, jsonMode: true, streaming: false })
  }
  return buildChatRequest(modelName, prompt, payload, [], taskType, { jsonSchema: true, text: true, vision: false, jsonMode: true, streaming: false })
}

function parseTaskOutput(taskType: AiTaskType, text: string): AiTaskOutput | StructuredOutputFailure {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    return { kind: 'invalid_json' }
  }
  return isAiTaskOutput(taskType, value) ? value : { kind: 'invalid_schema' }
}

function isStructuredOutputFailure(value: AiTaskOutput | StructuredOutputFailure): value is StructuredOutputFailure {
  return 'kind' in value
}

function shouldRepair(value: AiTaskOutput | StructuredOutputFailure): value is StructuredOutputFailure {
  return 'kind' in value
}

function requestPayload(
  protocol: AiProtocol,
  request: AiTaskRequest,
  prompt: { readonly system: string; readonly instruction: string },
  payload: unknown = inputPayload(request),
  images: readonly DerivedImageInput[] = request.images,
): Record<string, unknown> {
  return protocol === 'responses'
    ? buildResponsesRequest(request.modelName, prompt, payload, images, request.taskType, request.capabilities)
    : buildChatRequest(request.modelName, prompt, payload, images, request.taskType, request.capabilities)
}

function validateImages(request: AiTaskRequest): void {
  const manifestTokens = new Set(request.manifest.items.map((item) => item.sourceToken))
  for (const image of request.images) {
    if (!manifestTokens.has(image.sourceToken) || !image.dataUrl.startsWith('data:image/webp;base64,')) {
      throw new AiProviderError('provider_content_rejected')
    }
  }
}

function requestConnectionPayload(
  protocol: AiProtocol,
  request: ConnectionTestRequest,
): Record<string, unknown> {
  const prompt = getPrompt('connection-v1')
  const taskRequest: AiTaskRequest = {
    apiKey: request.apiKey,
    modelName: request.modelName,
    taskType: 'classify_evidence',
    manifest: {
      taskId: '00000000-0000-4000-8000-000000000001',
      taskType: 'classify_evidence',
      providerPreset: 'custom',
      protocol,
      baseUrlFingerprint: 'sha256:connection-test',
      modelName: request.modelName,
      items: [],
      batchCount: 1,
      totalDerivedBytes: 0,
    },
    inputText: CONNECTION_TEXT,
    images: [{ sourceToken: '00000000-0000-4000-8000-000000000002', dataUrl: CONNECTION_IMAGE }],
    capabilities: request.capabilities,
  }
  return requestPayload(protocol, taskRequest, prompt, { text: CONNECTION_TEXT }, taskRequest.images)
}

function assertSuccessful(response: PinnedHttpsResponse): void {
  const code = mapStatus(response.statusCode)
  if (code !== null) {
    throw new AiProviderError(code)
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new AiProviderError('provider_unreachable')
  }
}

export function createProviderAdapter(input: {
  readonly protocol: AiProtocol
  readonly client: PinnedHttpsClient
}): AiProviderAdapter {
  async function call(
    apiKey: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<UpstreamEnvelope> {
    let response: PinnedHttpsResponse
    try {
      response = await input.client.post({ apiKey, body: encodeBody(body), signal })
    } catch (error) {
      throw mapTransportError(error)
    }
    assertSuccessful(response)
    return extractEnvelope(response, input.protocol)
  }

  return {
    async testConnection(request, signal) {
      const envelope = await call(request.apiKey, requestConnectionPayload(input.protocol, request), signal)
      if (envelope.text.length === 0) {
        throw new AiProviderError('invalid_structured_output')
      }
      return {
        capabilities: request.capabilities,
        usage: envelope.usage,
        providerRequestIdFingerprint: envelope.providerRequestIdFingerprint,
      }
    },

    async executeTask(request, signal) {
      validateImages(request)
      const initial = await call(request.apiKey, requestPayload(input.protocol, request, getTaskPrompt(request.taskType)), signal)
      const parsed = parseTaskOutput(request.taskType, initial.text)
      if (!shouldRepair(parsed)) {
        return {
          output: parsed,
          usage: initial.usage,
          repairAttempted: false,
          providerRequestIdFingerprint: initial.providerRequestIdFingerprint,
        }
      }

      let repair: UpstreamEnvelope
      try {
        repair = await call(
          request.apiKey,
          buildRepairRequest(input.protocol, request.modelName, request.taskType, initial.text),
          signal,
        )
      } catch (error) {
        const mapped = mapTransportError(error)
        if (mapped.code === 'request_cancelled') {
          throw mapped
        }
        throw new AiProviderError('repair_failed')
      }

      const repaired = parseTaskOutput(request.taskType, repair.text)
      if (isStructuredOutputFailure(repaired)) {
        throw new AiProviderError('repair_failed')
      }
      return {
        output: repaired,
        usage: mergeUsage(initial.usage, repair.usage),
        repairAttempted: true,
        providerRequestIdFingerprint: repair.providerRequestIdFingerprint ?? initial.providerRequestIdFingerprint,
      }
    },
  }
}
