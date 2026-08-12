import { lookup } from 'node:dns/promises'
import { createHash } from 'node:crypto'
import { Type } from '@sinclair/typebox'
import type { Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import {
  AiProtocolSchema,
  AiTaskTypeSchema,
  isAiTaskOutput,
  WireInputManifestSchema,
  ProviderCapabilitiesSchema,
  ProviderPresetSchema,
  PROVIDER_PRESETS,
  type AiProtocol,
  type AiTaskType,
  type ProviderErrorCode,
  type ProviderPreset,
} from '@youju/ai-core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  AiProviderError,
  createProviderAdapter,
  type AiProviderAdapter,
  type AiTaskRequest,
  type AiTaskResult,
  type ConnectionTestResult,
  type ConnectionTestRequest,
} from '../ai/provider-adapters.js'
import { createPinnedHttpsClient } from '../ai/pinned-https-client.js'
import { normalizeTarget, type DnsResolver, type TargetInput } from '../ai/target-policy.js'
import { GuardLimitError, getTimeoutPolicy, RequestGuard, type Clock } from '../ai/request-guard.js'

const MAX_REQUEST_BYTES = 32 * 1024 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_MODEL_NAME_LENGTH = 256
const MAX_API_KEY_LENGTH = 2048
const MAX_BASE_URL_LENGTH = 2048
const MAX_INPUT_TEXT_LENGTH = 512 * 1024
const MAX_IMAGE_DATA_URL_LENGTH = 3 * 1024 * 1024

const ConnectionRequestSchema = Type.Object({
  requestId: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' }),
  providerPreset: ProviderPresetSchema,
  protocol: AiProtocolSchema,
  baseUrl: Type.Optional(Type.String({ minLength: 1, maxLength: MAX_BASE_URL_LENGTH })),
  modelName: Type.String({ minLength: 1, maxLength: MAX_MODEL_NAME_LENGTH }),
  apiKey: Type.String({ minLength: 1, maxLength: MAX_API_KEY_LENGTH }),
  capabilities: ProviderCapabilitiesSchema,
}, { additionalProperties: false })

const TaskRequestSchema = Type.Object({
  requestId: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' }),
  providerPreset: ProviderPresetSchema,
  protocol: AiProtocolSchema,
  baseUrl: Type.Optional(Type.String({ minLength: 1, maxLength: MAX_BASE_URL_LENGTH })),
  modelName: Type.String({ minLength: 1, maxLength: MAX_MODEL_NAME_LENGTH }),
  apiKey: Type.String({ minLength: 1, maxLength: MAX_API_KEY_LENGTH }),
  capabilities: ProviderCapabilitiesSchema,
  manifest: WireInputManifestSchema,
  inputText: Type.Optional(Type.String({ maxLength: MAX_INPUT_TEXT_LENGTH })),
  images: Type.Array(Type.Object({
    sourceToken: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' }),
    dataUrl: Type.String({
      pattern: '^data:image/webp;base64,[A-Za-z0-9+/]*={0,2}$',
      maxLength: MAX_IMAGE_DATA_URL_LENGTH,
    }),
  }, { additionalProperties: false }), { maxItems: 30 }),
}, { additionalProperties: false })

const TaskParamsSchema = Type.Object({ taskType: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false })

type ConnectionBody = Static<typeof ConnectionRequestSchema>
type TaskBody = Static<typeof TaskRequestSchema>
type TaskParams = Static<typeof TaskParamsSchema>

export interface CreateAdapterInput {
  readonly protocol: AiProtocol
  readonly client: ReturnType<typeof createPinnedHttpsClient>
}

export type CreateAdapter = (input: CreateAdapterInput) => AiProviderAdapter

export interface AiRouteDependencies {
  readonly createAdapter: CreateAdapter
  readonly resolver: DnsResolver
  readonly clock: Clock
  readonly guard: RequestGuard
}

function nodeResolver(): DnsResolver {
  return {
    async resolve(hostname) {
      const addresses = await lookup(hostname, { all: true, verbatim: true })
      return addresses.flatMap((address) => address.family === 4 || address.family === 6
        ? [{ address: address.address, family: address.family }]
        : [])
    },
  }
}

export function createDefaultAiRouteDependencies(input: {
  readonly createAdapter?: CreateAdapter
  readonly resolver?: DnsResolver
  readonly clock?: Clock
  readonly guard?: RequestGuard
} = {}): AiRouteDependencies {
  return {
    createAdapter: input.createAdapter ?? ((adapterInput) => createProviderAdapter(adapterInput)),
    resolver: input.resolver ?? nodeResolver(),
    clock: input.clock ?? { now: () => Date.now() },
    guard: input.guard ?? (input.clock === undefined
      ? new RequestGuard()
      : new RequestGuard({ clock: input.clock })),
  }
}

function errorCode(value: unknown): ProviderErrorCode {
  if (value instanceof AiProviderError || value instanceof GuardLimitError) {
    return value.code
  }
  if (value instanceof Error) {
    const stableCodes: readonly ProviderErrorCode[] = [
      'request_cancelled',
      'provider_timeout',
      'provider_response_too_large',
      'target_not_allowed',
    ]
    const matched = stableCodes.find((code) => value.message === code)
    if (matched !== undefined) {
      return matched
    }
  }
  return 'provider_unreachable'
}

function isSafeTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isSafeUsage(value: unknown): value is ConnectionTestResult['usage'] {
  if (value === null) {
    return true
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const usage = value as Record<string, unknown>
  return isSafeTokenCount(usage.inputTokens) && isSafeTokenCount(usage.outputTokens) && isSafeTokenCount(usage.totalTokens)
}

function isRequestIdFingerprint(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value))
}

function safeConnectionResult(value: ConnectionTestResult): ConnectionTestResult {
  if (!Value.Check(ProviderCapabilitiesSchema, value.capabilities) || !isSafeUsage(value.usage) || !isRequestIdFingerprint(value.providerRequestIdFingerprint)) {
    throw new AiProviderError('invalid_structured_output')
  }
  return {
    capabilities: value.capabilities,
    usage: value.usage,
    providerRequestIdFingerprint: value.providerRequestIdFingerprint,
  }
}

function safeTaskResult(value: AiTaskResult, taskType: AiTaskType): AiTaskResult {
  if (
    !isAiTaskOutput(taskType, value.output) ||
    !isSafeUsage(value.usage) ||
    typeof value.repairAttempted !== 'boolean' ||
    !isRequestIdFingerprint(value.providerRequestIdFingerprint)
  ) {
    throw new AiProviderError('invalid_structured_output')
  }
  if (responseBytes(value) > MAX_RESPONSE_BYTES) {
    throw new AiProviderError('provider_response_too_large')
  }
  return {
    output: value.output,
    usage: value.usage,
    repairAttempted: value.repairAttempted,
    providerRequestIdFingerprint: value.providerRequestIdFingerprint,
  }
}

function statusForError(code: ProviderErrorCode): number {
  switch (code) {
    case 'provider_auth_failed': return 401
    case 'provider_model_not_found': return 404
    case 'provider_rate_limited': return 429
    case 'provider_quota_exceeded': return 402
    case 'provider_content_rejected':
    case 'target_not_allowed':
    case 'provider_capability_missing': return 400
    case 'request_cancelled': return 499
    case 'provider_timeout': return 504
    case 'task_already_running': return 409
    case 'provider_unreachable':
    case 'provider_response_too_large':
    case 'invalid_structured_output':
    case 'repair_failed': return 502
  }
}

function sendError(reply: FastifyReply, code: ProviderErrorCode): void {
  reply.code(statusForError(code)).send({ error: { code } })
}

function baseUrlFingerprint(target: TargetInput): string {
  const normalized = normalizeTarget(target)
  return `sha256:${createHash('sha256').update(`${normalized.hostname}${normalized.path}`).digest('hex')}`
}

function ensureProviderConfiguration(
  providerPreset: ProviderPreset,
  protocol: AiProtocol,
  target: TargetInput,
): void {
  const definition = PROVIDER_PRESETS[providerPreset]
  if (definition.protocol !== protocol) {
    throw new AiProviderError('provider_content_rejected')
  }
  normalizeTarget(target)
}

function createRequestSignal(request: FastifyRequest, outerMs: number): {
  readonly signal: AbortSignal
  readonly didTimeout: () => boolean
  readonly cleanup: () => void
} {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('provider_timeout'))
  }, outerMs)
  const abort = () => controller.abort(new Error('request_cancelled'))
  request.raw.once('aborted', abort)
  request.raw.once('close', abort)
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer)
      request.raw.removeListener('aborted', abort)
      request.raw.removeListener('close', abort)
    },
  }
}

function requestTarget(body: Pick<ConnectionBody, 'providerPreset' | 'baseUrl'>): TargetInput {
  return { providerPreset: body.providerPreset, ...(body.baseUrl === undefined ? {} : { baseUrl: body.baseUrl }) }
}

function validateTaskBody(body: TaskBody, taskType: AiTaskType): void {
  if (!Value.Check(WireInputManifestSchema, body.manifest) || body.manifest.taskType !== taskType) {
    throw new AiProviderError('provider_content_rejected')
  }
  if (body.manifest.providerPreset !== body.providerPreset || body.manifest.protocol !== body.protocol || body.manifest.modelName !== body.modelName) {
    throw new AiProviderError('provider_content_rejected')
  }
  const sourceTokens = new Set(body.manifest.items.map((item) => item.sourceToken))
  if (body.images.some((image) => !sourceTokens.has(image.sourceToken))) {
    throw new AiProviderError('provider_content_rejected')
  }
  if (!body.capabilities.text || !body.capabilities.jsonMode && !body.capabilities.jsonSchema) {
    throw new AiProviderError('provider_capability_missing')
  }
  if (taskType !== 'draft_statement' && !body.capabilities.vision) {
    throw new AiProviderError('provider_capability_missing')
  }
  if (taskType === 'draft_statement' && !body.capabilities.text) {
    throw new AiProviderError('provider_capability_missing')
  }
}

function responseBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function logMetadata(
  request: FastifyRequest,
  statusCode: number,
  startedAt: number,
  metadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    requestId: metadata.requestId,
    taskType: metadata.taskType,
    providerPreset: metadata.providerPreset,
    baseUrlFingerprint: metadata.baseUrlFingerprint,
    statusClass: `${Math.floor(statusCode / 100)}xx`,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...(metadata.usage === undefined ? {} : { usage: metadata.usage }),
    ...(metadata.errorCode === undefined ? {} : { errorCode: metadata.errorCode }),
    ipClass: request.ip.includes(':') ? 'ipv6' : 'ipv4',
  }
}

export async function aiRoutes(app: FastifyInstance, dependencies: AiRouteDependencies): Promise<void> {
  app.post('/ai/connection-test', { schema: { body: ConnectionRequestSchema } }, async (request, reply) => {
    if (!Value.Check(ConnectionRequestSchema, request.body)) {
      sendError(reply, 'provider_content_rejected')
      return
    }
    const body = request.body as ConnectionBody
    const startedAt = dependencies.clock.now()
    const target = requestTarget(body)
    let fingerprint: string | undefined
    let lease: ReturnType<RequestGuard['acquire']> | undefined
    const timeout = getTimeoutPolicy('connection-test')
    try {
      dependencies.guard.record(request.ip)
      lease = dependencies.guard.acquire(request.ip)
      ensureProviderConfiguration(body.providerPreset, body.protocol, target)
      fingerprint = baseUrlFingerprint(target)
      const client = createPinnedHttpsClient({ target, resolver: dependencies.resolver, maxResponseBytes: MAX_RESPONSE_BYTES })
      const adapter = dependencies.createAdapter({ protocol: body.protocol, client })
      const requestSignal = createRequestSignal(request, timeout.outerMs)
      try {
        const result = await adapter.testConnection({
          apiKey: body.apiKey,
          modelName: body.modelName,
          capabilities: body.capabilities,
        } satisfies ConnectionTestRequest, requestSignal.signal)
        const safeResult = safeConnectionResult(result)
        const response = { requestId: body.requestId, ...safeResult }
        if (responseBytes(response) > MAX_RESPONSE_BYTES) {
          sendError(reply, 'provider_response_too_large')
          app.log.info(logMetadata(request, 502, startedAt, { requestId: body.requestId, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, usage: result.usage }))
          return
        }
        reply.code(200).send(response)
        app.log.info(logMetadata(request, 200, startedAt, { requestId: body.requestId, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, usage: result.usage }))
      } catch (error) {
        const code = requestSignal.didTimeout() ? 'provider_timeout' : errorCode(error)
        sendError(reply, code)
        app.log.info(logMetadata(request, statusForError(code), startedAt, { requestId: body.requestId, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, errorCode: code }))
      } finally {
        requestSignal.cleanup()
      }
    } catch (error) {
      const code = errorCode(error)
      sendError(reply, code)
      app.log.info(logMetadata(request, statusForError(code), startedAt, { requestId: body.requestId, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, errorCode: code }))
    } finally {
      lease?.release()
    }
  })

  app.post('/ai/tasks/:taskType', { schema: { params: TaskParamsSchema, body: TaskRequestSchema } }, async (request, reply) => {
    const body = request.body as TaskBody
    const taskTypeParam = (request.params as TaskParams).taskType
    if (!Value.Check(AiTaskTypeSchema, taskTypeParam)) {
      reply.code(404).send()
      return
    }
    const taskType = taskTypeParam as AiTaskType
    const startedAt = dependencies.clock.now()
    const target = requestTarget(body)
    let fingerprint: string | undefined = body.manifest.baseUrlFingerprint
    let lease: ReturnType<RequestGuard['acquire']> | undefined
    const timeout = getTimeoutPolicy(taskType)
    try {
      dependencies.guard.record(request.ip)
      lease = dependencies.guard.acquire(request.ip)
      ensureProviderConfiguration(body.providerPreset, body.protocol, target)
      validateTaskBody(body, taskType)
      fingerprint = baseUrlFingerprint(target)
      const client = createPinnedHttpsClient({ target, resolver: dependencies.resolver, maxResponseBytes: MAX_RESPONSE_BYTES })
      const adapter = dependencies.createAdapter({ protocol: body.protocol, client })
      const requestSignal = createRequestSignal(request, timeout.outerMs)
      try {
        const aiRequest: AiTaskRequest = {
          apiKey: body.apiKey,
          modelName: body.modelName,
          taskType,
          manifest: body.manifest,
          ...(body.inputText === undefined ? {} : { inputText: body.inputText }),
          images: body.images,
          capabilities: body.capabilities,
          repairTimeoutMs: timeout.repairMs,
          deadlineAt: Date.now() + timeout.outerMs,
        }
        const result = await adapter.executeTask(aiRequest, requestSignal.signal)
        const safeResult = safeTaskResult(result, taskType)
        const response = { requestId: body.requestId, taskType, ...safeResult }
        if (responseBytes(response) > MAX_RESPONSE_BYTES) {
          sendError(reply, 'provider_response_too_large')
          app.log.info(logMetadata(request, 502, startedAt, { requestId: body.requestId, taskType, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, usage: safeResult.usage }))
          return
        }
        reply.code(200).send(response)
        app.log.info(logMetadata(request, 200, startedAt, { requestId: body.requestId, taskType, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, usage: safeResult.usage }))
      } catch (error) {
        const code = requestSignal.didTimeout() ? 'provider_timeout' : errorCode(error)
        sendError(reply, code)
        app.log.info(logMetadata(request, statusForError(code), startedAt, { requestId: body.requestId, taskType, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, errorCode: code }))
      } finally {
        requestSignal.cleanup()
      }
    } catch (error) {
      const code = errorCode(error)
      sendError(reply, code)
      app.log.info(logMetadata(request, statusForError(code), startedAt, { requestId: body.requestId, taskType, providerPreset: body.providerPreset, baseUrlFingerprint: fingerprint, errorCode: code }))
    } finally {
      lease?.release()
    }
  })
}

export { MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES }
