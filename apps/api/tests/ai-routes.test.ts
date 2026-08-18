import { describe, expect, it, vi } from 'vitest'
import type { ProviderCapabilities, WireInputManifest } from '@youju/ai-core'
import {
  AiProviderError,
  type AiProviderAdapter,
  type AiTaskResult,
  type ConnectionTestResult,
} from '../src/ai/provider-adapters.js'
import { buildApp } from '../src/app.js'
import type { CreateAdapter } from '../src/routes/ai.js'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const TASK_ID = '22222222-2222-4222-8222-222222222222'
const SOURCE_TOKEN = '33333333-3333-4333-8333-333333333333'
const API_KEY = 'sk-fictional-route-key'
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

const taskBody = {
  requestId: REQUEST_ID,
  providerPreset: 'openai' as const,
  protocol: 'responses' as const,
  modelName: 'fictional-model',
  apiKey: API_KEY,
  capabilities,
  manifest,
  inputText: 'fictional route input',
  images: [{ sourceToken: SOURCE_TOKEN, dataUrl: 'data:image/webp;base64,UklGRg==' }],
}

const connectionBody = {
  requestId: REQUEST_ID,
  providerPreset: 'openai' as const,
  protocol: 'responses' as const,
  modelName: 'fictional-model',
  apiKey: API_KEY,
  capabilities,
}

const result: AiTaskResult = {
  output: { classifications: [], warnings: [] },
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  repairAttempted: false,
  providerRequestIdFingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}

const connectionResult: ConnectionTestResult = {
  capabilities,
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  providerRequestIdFingerprint: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}

function makeAdapter(overrides: Partial<AiProviderAdapter> = {}): {
  adapter: AiProviderAdapter
  createAdapter: CreateAdapter
} {
  const adapter: AiProviderAdapter = {
    testConnection: vi.fn(async () => connectionResult),
    executeTask: vi.fn(async () => result),
    ...overrides,
  }
  return {
    adapter,
    createAdapter: vi.fn(() => adapter),
  }
}

async function closeApp(app: { close: () => Promise<void> }): Promise<void> {
  await app.close()
}

describe('guarded AI routes', () => {
  it('serves connection tests and tasks as no-store standardized envelopes', async () => {
    const { adapter, createAdapter } = makeAdapter()
    const app = buildApp({ createAdapter })

    try {
      const connection = await app.inject({ method: 'POST', url: '/ai/connection-test', payload: connectionBody })
      const task = await app.inject({ method: 'POST', url: '/ai/tasks/classify_evidence', payload: taskBody })

      expect(connection.statusCode).toBe(200)
      expect(connection.headers['cache-control']).toBe('no-store')
      expect(connection.json()).toEqual({ requestId: REQUEST_ID, ...connectionResult })
      expect(task.statusCode).toBe(200)
      expect(task.headers['cache-control']).toBe('no-store')
      expect(task.json()).toEqual({ requestId: REQUEST_ID, taskType: 'classify_evidence', ...result })
      expect(adapter.testConnection).toHaveBeenCalledOnce()
      expect(adapter.executeTask).toHaveBeenCalledOnce()
    } finally {
      await closeApp(app)
    }
  })

  it('rejects unknown tasks, repair routes, additional fields, invalid UUIDs, and missing keys', async () => {
    const { createAdapter } = makeAdapter()
    const app = buildApp({ createAdapter })
    try {
      const unknownTask = await app.inject({ method: 'POST', url: '/ai/tasks/repair', payload: taskBody })
      const additional = await app.inject({ method: 'POST', url: '/ai/connection-test', payload: { ...connectionBody, secretField: 'sentinel' }, headers: { 'content-type': 'application/json' } })
      const invalidId = await app.inject({ method: 'POST', url: '/ai/connection-test', payload: { ...connectionBody, requestId: 'not-uuid' } })
      const missingKey = await app.inject({ method: 'POST', url: '/ai/connection-test', payload: { ...connectionBody, apiKey: '' } })

      expect(unknownTask.statusCode).toBe(404)
      expect(additional.statusCode).toBe(400)
      expect(invalidId.statusCode).toBe(400)
      expect(missingKey.statusCode).toBe(400)
      for (const response of [unknownTask, additional, invalidId, missingKey]) {
        expect(response.headers['cache-control']).toBe('no-store')
        expect(response.body).not.toContain(API_KEY)
        expect(response.body).not.toContain('sentinel')
      }
    } finally {
      await closeApp(app)
    }
  })

  it('rejects cross-site browser requests before any provider work', async () => {
    const { adapter, createAdapter } = makeAdapter()
    const app = buildApp({ createAdapter })
    try {
      const crossSite = await app.inject({
        method: 'POST',
        url: '/ai/connection-test',
        headers: {
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
          'content-type': 'application/json',
        },
        payload: connectionBody,
      })
      const foreignOrigin = await app.inject({
        method: 'POST',
        url: '/ai/connection-test',
        headers: {
          origin: 'https://evil.example',
          'content-type': 'application/json',
        },
        payload: connectionBody,
      })
      const sameOrigin = await app.inject({
        method: 'POST',
        url: '/ai/connection-test',
        headers: {
          origin: 'http://localhost:80',
          'content-type': 'application/json',
        },
        payload: connectionBody,
      })

      expect(crossSite.statusCode).toBe(403)
      expect(foreignOrigin.statusCode).toBe(403)
      expect(sameOrigin.statusCode).toBe(200)
      expect(adapter.testConnection).toHaveBeenCalledOnce()
    } finally {
      await closeApp(app)
    }
  })

  it('maps provider failures to stable errors without raw upstream content', async () => {
    const { createAdapter } = makeAdapter({
      executeTask: vi.fn(async () => { throw new AiProviderError('provider_auth_failed') }),
    })
    const app = buildApp({ createAdapter })
    try {
      const response = await app.inject({ method: 'POST', url: '/ai/tasks/classify_evidence', payload: taskBody })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ error: { code: 'provider_auth_failed' } })
      expect(response.body).not.toContain(API_KEY)
      expect(response.body).not.toContain('authorization')
      expect(response.body).not.toContain('raw upstream')
    } finally {
      await closeApp(app)
    }
  })

  it('maps forbidden targets and missing capabilities to stable bounded errors', async () => {
    const { createAdapter } = makeAdapter()
    const app = buildApp({ createAdapter })
    try {
      const target = await app.inject({
        method: 'POST',
        url: '/ai/connection-test',
        payload: { ...connectionBody, providerPreset: 'custom', protocol: 'chat_completions', baseUrl: 'https://127.0.0.1/v1' },
      })
      const capability = await app.inject({
        method: 'POST',
        url: '/ai/tasks/classify_evidence',
        payload: { ...taskBody, capabilities: { ...capabilities, vision: false } },
      })

      expect(target.statusCode).toBe(400)
      expect(target.json()).toEqual({ error: { code: 'target_not_allowed' } })
      expect(capability.statusCode).toBe(400)
      expect(capability.json()).toEqual({ error: { code: 'provider_capability_missing' } })
    } finally {
      await closeApp(app)
    }
  })

  it('rejects request bodies over 32 MiB without echoing their content', async () => {
    const { createAdapter } = makeAdapter()
    const app = buildApp({ createAdapter })
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/ai/connection-test',
        payload: { ...connectionBody, modelName: 'request-sentinel-' + 'x'.repeat(33 * 1024 * 1024) },
      })

      expect(response.statusCode).toBe(413)
      expect(response.body).not.toContain('request-sentinel')
      expect(response.headers['cache-control']).toBe('no-store')
    } finally {
      await closeApp(app)
    }
  })

  it('rejects a standardized response over 2 MiB without echoing its output', async () => {
    const oversizedResult: AiTaskResult = {
      ...result,
      output: { classifications: [], warnings: ['response-sentinel-' + 'x'.repeat(2 * 1024 * 1024)] },
    }
    const { createAdapter } = makeAdapter({ executeTask: vi.fn(async () => oversizedResult) })
    const app = buildApp({ createAdapter })
    try {
      const response = await app.inject({ method: 'POST', url: '/ai/tasks/classify_evidence', payload: taskBody })

      expect(response.statusCode).toBe(502)
      expect(response.json()).toEqual({ error: { code: 'provider_response_too_large' } })
      expect(response.body).not.toContain('response-sentinel')
    } finally {
      await closeApp(app)
    }
  })
})
