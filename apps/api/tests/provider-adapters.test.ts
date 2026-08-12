import { describe, expect, it } from 'vitest'
import type { ProviderCapabilities, WireInputManifest } from '@youju/ai-core'
import type { PinnedHttpsClient, PinnedHttpsResponse } from '../src/ai/pinned-https-client.js'
import {
  AiProviderError,
  createProviderAdapter,
  type AiTaskRequest,
  type ConnectionTestRequest,
} from '../src/ai/provider-adapters.js'

const TASK_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_TOKEN = '22222222-2222-4222-8222-222222222222'
const DERIVED_WEBP = 'data:image/webp;base64,UklGRg=='
const API_KEY = 'sk-fictional-only'

const capabilities: ProviderCapabilities = {
  text: true,
  vision: true,
  jsonMode: true,
  jsonSchema: true,
  streaming: false,
}

const manifest: WireInputManifest = {
  taskId: TASK_ID,
  taskType: 'classify_evidence',
  providerPreset: 'openai',
  protocol: 'responses',
  baseUrlFingerprint: 'sha256:fictional',
  modelName: 'fictional-model',
  items: [{
    sourceToken: SOURCE_TOKEN,
    page: 1,
    derivedMediaType: 'image/webp',
    pixelWidth: 1,
    pixelHeight: 1,
    byteSize: 4,
    derivedSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }],
  batchCount: 1,
  totalDerivedBytes: 4,
}

const taskRequest: AiTaskRequest = {
  apiKey: API_KEY,
  modelName: 'fictional-model',
  taskType: 'classify_evidence',
  manifest,
  inputText: 'fictional material text',
  images: [{ sourceToken: SOURCE_TOKEN, dataUrl: DERIVED_WEBP }],
  capabilities,
}

function response(body: unknown, statusCode = 200): PinnedHttpsResponse {
  return {
    statusCode,
    headers: {},
    body: new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

function clientFor(...responses: readonly PinnedHttpsResponse[]): {
  client: PinnedHttpsClient
  bodies: string[]
} {
  const bodies: string[] = []
  let index = 0
  return {
    bodies,
    client: {
      async post(input) {
        bodies.push(new TextDecoder().decode(input.body))
        const next = responses[index]
        index += 1
        if (next === undefined) {
          throw new Error('missing fictional response')
        }
        return next
      },
    },
  }
}

function responsesEnvelope(outputText: string, usage = { input_tokens: 2, output_tokens: 3, total_tokens: 5 }) {
  return response({
    id: 'resp-fictional',
    output: [{ type: 'message', content: [{ type: 'output_text', text: outputText }], reasoning: 'must not leak' }],
    usage,
  })
}

function chatEnvelope(outputText: string, usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }) {
  return response({
    id: 'chat-fictional',
    choices: [{ message: { role: 'assistant', content: outputText, reasoning_content: 'must not leak' } }],
    usage,
  })
}

function connectionRequest(overrides: Partial<ConnectionTestRequest> = {}): ConnectionTestRequest {
  return {
    apiKey: API_KEY,
    modelName: 'fictional-model',
    capabilities,
    ...overrides,
  }
}

describe('provider adapters', () => {
  it('builds a restricted Responses request with derived WebP only', async () => {
    const { client, bodies } = clientFor(responsesEnvelope(JSON.stringify({ classifications: [], warnings: [] })))
    const adapter = createProviderAdapter({ protocol: 'responses', client })

    await adapter.executeTask(taskRequest, new AbortController().signal)

    const body = JSON.parse(bodies[0] ?? '{}') as Record<string, unknown>
    expect(body).toMatchObject({ model: 'fictional-model', store: false })
    expect(body).not.toHaveProperty('conversation')
    expect(body).not.toHaveProperty('previous_response_id')
    expect(body).not.toHaveProperty('background')
    expect(body).not.toHaveProperty('files')
    expect(body).not.toHaveProperty('tools')
    expect(JSON.stringify(body)).toContain(DERIVED_WEBP)
    expect(JSON.stringify(body)).not.toContain(API_KEY)
    expect(body.text).toMatchObject({ format: { type: 'json_schema' } })
  })

  it('builds a controlled Chat Completions request without provider-private fields', async () => {
    const { client, bodies } = clientFor(chatEnvelope(JSON.stringify({ classifications: [], warnings: [] })))
    const adapter = createProviderAdapter({ protocol: 'chat_completions', client })

    await adapter.executeTask({
      ...taskRequest,
      manifest: { ...manifest, protocol: 'chat_completions', providerPreset: 'deepseek' },
      capabilities: { ...capabilities, jsonSchema: false },
    }, new AbortController().signal)

    const body = JSON.parse(bodies[0] ?? '{}') as Record<string, unknown>
    expect(body).toMatchObject({ model: 'fictional-model' })
    expect(body).not.toHaveProperty('tools')
    expect(body).not.toHaveProperty('seed')
    expect(body).not.toHaveProperty('parallel_tool_calls')
    expect(body).not.toHaveProperty('response_format.json_schema')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages).toBeInstanceOf(Array)
  })

  it('rejects non-WebP images and source tokens outside the manifest before forwarding', async () => {
    const { client, bodies } = clientFor(chatEnvelope(JSON.stringify({ classifications: [], warnings: [] })))
    const adapter = createProviderAdapter({ protocol: 'chat_completions', client })

    await expect(adapter.executeTask({
      ...taskRequest,
      manifest: { ...manifest, protocol: 'chat_completions', providerPreset: 'deepseek' },
      images: [{ sourceToken: '33333333-3333-4333-8333-333333333333', dataUrl: 'data:image/png;base64,AA==' }],
      capabilities: { ...capabilities, jsonSchema: false },
    }, new AbortController().signal)).rejects.toMatchObject({ code: 'provider_content_rejected' })

    expect(bodies).toHaveLength(0)
  })

  it('uses fixed fictional content for connection tests', async () => {
    const { client, bodies } = clientFor(responsesEnvelope(JSON.stringify({ ok: true })))
    const adapter = createProviderAdapter({ protocol: 'responses', client })

    const result = await adapter.testConnection(connectionRequest(), new AbortController().signal)
    const body = JSON.parse(bodies[0] ?? '{}') as Record<string, unknown>

    expect(result.capabilities).toEqual(capabilities)
    expect(JSON.stringify(body)).toContain('fictional')
    expect(JSON.stringify(body)).toContain('data:image/webp;base64')
    expect(JSON.stringify(body)).not.toContain('caseId')
    expect(JSON.stringify(body)).not.toContain(API_KEY)
  })

  it('repairs malformed structured output once and merges low-sensitivity usage', async () => {
    const { client, bodies } = clientFor(
      responsesEnvelope('not-json', { input_tokens: 2, output_tokens: 4, total_tokens: 6 }),
      responsesEnvelope(JSON.stringify({ classifications: [], warnings: [] }), { input_tokens: 7, output_tokens: 8, total_tokens: 15 }),
    )
    const adapter = createProviderAdapter({ protocol: 'responses', client })

    const result = await adapter.executeTask(taskRequest, new AbortController().signal)

    expect(result.output).toEqual({ classifications: [], warnings: [] })
    expect(result.repairAttempted).toBe(true)
    expect(result.usage).toEqual({ inputTokens: 9, outputTokens: 12, totalTokens: 21 })
    expect(bodies).toHaveLength(2)
    const repairBody = JSON.parse(bodies[1] ?? '{}') as Record<string, unknown>
    expect(JSON.stringify(repairBody)).toContain('not-json')
    expect(JSON.stringify(repairBody)).toContain('classify_evidence')
    expect(JSON.stringify(repairBody)).toContain('Return only JSON that matches the named schema')
    expect(JSON.stringify(repairBody)).not.toContain(DERIVED_WEBP)
    expect(JSON.stringify(repairBody)).not.toContain('fictional material text')
  })

  it('maps repair failure to a stable error and never returns upstream output', async () => {
    const { client } = clientFor(responsesEnvelope('not-json'), responsesEnvelope('still-not-json'))
    const adapter = createProviderAdapter({ protocol: 'responses', client })

    await expect(adapter.executeTask(taskRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: 'repair_failed', message: 'repair_failed' })
  })

  it.each([
    [401, 'provider_auth_failed'],
    [404, 'provider_model_not_found'],
    [402, 'provider_quota_exceeded'],
    [413, 'provider_response_too_large'],
    [429, 'provider_rate_limited'],
    [408, 'provider_timeout'],
  ] as const)('maps status %s to %s without repair', async (statusCode, code) => {
    const { client } = clientFor(response({ error: 'secret upstream error' }, statusCode))
    const adapter = createProviderAdapter({ protocol: 'responses', client })

    const error = await adapter.executeTask(taskRequest, new AbortController().signal).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(AiProviderError)
    expect(error).toMatchObject({ code, message: code })
    expect((error as Error).message).not.toContain('secret upstream error')
  })

  it('does not repair an empty response or a transport timeout', async () => {
    const empty = response('', 200)
    const timeout = clientFor(empty)
    timeout.client = {
      async post() {
        throw new Error('provider_timeout')
      },
    }
    const adapter = createProviderAdapter({ protocol: 'responses', client: timeout.client })

    await expect(adapter.executeTask(taskRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: 'provider_timeout' })
  })
})
