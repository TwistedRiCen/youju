import { describe, expect, it } from 'vitest'
import type { InputManifest } from '@youju/ai-core'
import { createAiApiClient } from '../src/ai/ai-api-client.js'

const caseId = '00000000-0000-4000-8000-000000000701'
const evidenceId = '00000000-0000-4000-8000-000000000702'
const sourceToken = '00000000-0000-4000-8000-000000000703'
const requestId = '00000000-0000-4000-8000-000000000704'
const apiKey = 'fictional-api-key-sentinel-task-11'

const manifest: InputManifest = {
  taskId: requestId,
  caseId,
  title: 'fictional local case title',
  taskType: 'classify_evidence',
  providerPreset: 'openai',
  protocol: 'responses',
  baseUrlFingerprint: 'sha256:fictional-provider',
  modelName: 'fictional-model',
  items: [{
    sourceToken,
    evidenceId,
    originalName: 'fictional-original-name.png',
    page: 1,
    derivedMediaType: 'image/webp',
    pixelWidth: 100,
    pixelHeight: 100,
    byteSize: 2,
    derivedSha256: 'a'.repeat(64),
  }],
  batchCount: 1,
  totalDerivedBytes: 2,
}

const capabilities = {
  text: true,
  vision: true,
  jsonMode: true,
  jsonSchema: true,
  streaming: false,
}

const validOutput = {
  classifications: [],
  warnings: [],
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('browser AI API client', () => {
  it('sends the dedicated credential with a redacted wire manifest only', async () => {
    let request: { url: string; init: RequestInit } | undefined
    const client = createAiApiClient({
      fetch: async (input, init) => {
        request = { url: String(input), init: init ?? {} }
        return response({
          requestId,
          taskType: 'classify_evidence',
          output: validOutput,
          usage: null,
          repairAttempted: true,
          providerRequestIdFingerprint: null,
        })
      },
    })

    await client.executeTask({
      requestId,
      providerPreset: 'openai',
      protocol: 'responses',
      modelName: 'fictional-model',
      apiKey,
      capabilities,
      manifest,
      inputText: 'fictional text',
      images: [{
        sourceToken,
        bytes: new Uint8Array([1, 2]),
      }],
    }, new AbortController().signal)

    expect(request?.url).toBe('/ai/tasks/classify_evidence')
    expect(request?.init.headers).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
    })
    expect(request?.init.headers).not.toHaveProperty('authorization')
    const body = JSON.parse(String(request?.init.body)) as Record<string, unknown>
    expect(body.apiKey).toBe(apiKey)
    expect(JSON.stringify(body)).toContain(sourceToken)
    expect(JSON.stringify(body)).not.toContain(caseId)
    expect(JSON.stringify(body)).not.toContain(evidenceId)
    expect(JSON.stringify(body)).not.toContain('fictional local case title')
    expect(JSON.stringify(body)).not.toContain('fictional-original-name.png')
    expect(body.images).toEqual([{ sourceToken, dataUrl: 'data:image/webp;base64,AQI=' }])
  })

  it('maps an aborted request to request_cancelled without exposing provider details', async () => {
    const client = createAiApiClient({
      fetch: (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('provider secret', 'AbortError')))
      }),
    })
    const controller = new AbortController()
    const pending = client.executeTask({
      requestId,
      providerPreset: 'openai',
      protocol: 'responses',
      modelName: 'fictional-model',
      apiKey,
      capabilities,
      manifest,
      images: [],
    }, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'request_cancelled' })
    await expect(pending).rejects.not.toThrow(apiKey)
  })

  it('accepts only stable error codes from an API error response', async () => {
    const client = createAiApiClient({
      fetch: async () => response({ error: { code: 'provider_auth_failed', detail: apiKey } }, 401),
    })

    const connection = client.testConnection({
      requestId,
      providerPreset: 'openai',
      protocol: 'responses',
      modelName: 'fictional-model',
      apiKey,
      capabilities,
    }, new AbortController().signal)

    await expect(connection).rejects.toMatchObject({
      code: 'provider_auth_failed',
    })
    await expect(connection).rejects.not.toThrow(apiKey)
  })
})
