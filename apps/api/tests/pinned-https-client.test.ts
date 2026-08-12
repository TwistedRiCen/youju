import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinnedHttpsClient } from '../src/ai/pinned-https-client.js'
import type {
  PinnedHttpsRequestOptions,
  PinnedHttpsResponse,
} from '../src/ai/pinned-https-client.js'

const targetInput = {
  providerPreset: 'custom' as const,
  baseUrl: 'https://example.com/v1',
}

afterEach(() => {
  vi.unstubAllEnvs()
})

function createConnector() {
  const request = vi.fn<(
    options: PinnedHttpsRequestOptions,
    body: Uint8Array,
  ) => Promise<PinnedHttpsResponse>>(async () => ({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: new TextEncoder().encode('{"ok":true}'),
  }))
  return {
    request,
  }
}

describe('pinned HTTPS AI client', () => {
  it('connects to the validated address with original-host TLS identity and fixed headers', async () => {
    const connector = createConnector()
    const resolver = {
      resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
    }
    const client = createPinnedHttpsClient({
      target: targetInput,
      resolver,
      connector,
    })

    const response = await client.post({
      apiKey: 'fictional-api-key',
      body: new TextEncoder().encode('{"task":"fictional"}'),
      signal: new AbortController().signal,
    })

    expect(response.statusCode).toBe(200)
    expect(resolver.resolve).toHaveBeenCalledTimes(1)
    expect(connector.request).toHaveBeenCalledWith(
      expect.objectContaining({
        address: '93.184.216.34',
        family: 4,
        servername: 'example.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        rejectUnauthorized: true,
        headers: {
          authorization: 'Bearer fictional-api-key',
          'content-type': 'application/json',
          'content-length': '20',
        },
      }),
      expect.any(Uint8Array),
    )
  })

  it('revalidates DNS for every request and never accepts user headers or follows redirects', async () => {
    vi.stubEnv('HTTP_PROXY', 'http://proxy.example.test:8080')
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.example.test:8443')
    vi.stubEnv('ALL_PROXY', 'http://proxy.example.test:3128')
    const connector = createConnector()
    connector.request.mockResolvedValueOnce({
      statusCode: 302,
      headers: { location: 'https://internal.example/' },
      body: new Uint8Array(),
    })
    const resolver = {
      resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
    }
    const client = createPinnedHttpsClient({ target: targetInput, resolver, connector })

    await expect(client.post({
      apiKey: 'fictional-api-key',
      body: new Uint8Array([1]),
      signal: new AbortController().signal,
    })).rejects.toThrow('target_not_allowed')

    connector.request.mockResolvedValueOnce({
      statusCode: 200,
      headers: {},
      body: new Uint8Array([2]),
    })
    await client.post({
      apiKey: 'fictional-api-key',
      body: new Uint8Array([3]),
      signal: new AbortController().signal,
    })

    expect(resolver.resolve).toHaveBeenCalledTimes(2)
    expect(connector.request.mock.calls[1]?.[0]).not.toHaveProperty('headers.cookie')
  })

  it('rejects a response that exceeds the client limit without exposing its body', async () => {
    const connector = createConnector()
    connector.request.mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: new Uint8Array([1, 2, 3]),
    })
    const client = createPinnedHttpsClient({
      target: targetInput,
      resolver: { resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]) },
      connector,
      maxResponseBytes: 2,
    })

    await expect(client.post({
      apiKey: 'fictional-api-key',
      body: new Uint8Array([1]),
      signal: new AbortController().signal,
    })).rejects.toThrow('provider_response_too_large')
  })
})
