import { describe, expect, it } from 'vitest'
import { isSameOriginAiRequest } from '../src/request-origin-policy.js'

interface RequestLike {
  readonly protocol: string
  readonly headers: {
    readonly origin?: string | string[] | undefined
    readonly 'sec-fetch-site'?: string | string[] | undefined
    readonly host?: string | string[] | undefined
  }
}

function request(
  headers: Partial<RequestLike['headers']>,
  protocol = 'https',
): RequestLike {
  return {
    protocol,
    headers: {
      origin: undefined,
      'sec-fetch-site': undefined,
      host: undefined,
      ...headers,
    },
  }
}

describe('same-origin AI request policy', () => {
  it('rejects cross-site fetch metadata regardless of the Origin header', () => {
    expect(
      isSameOriginAiRequest(
        request({ 'sec-fetch-site': 'cross-site', origin: 'https://youju.example', host: 'youju.example' }),
      ),
    ).toBe(false)
    expect(
      isSameOriginAiRequest(request({ 'sec-fetch-site': 'cross-site', host: 'youju.example' })),
    ).toBe(false)
  })

  it('rejects an Origin header from a different origin', () => {
    expect(
      isSameOriginAiRequest(request({ origin: 'https://evil.example', host: 'youju.example' })),
    ).toBe(false)
    expect(
      isSameOriginAiRequest(request({ origin: 'https://youju.example:8443', host: 'youju.example' })),
    ).toBe(false)
  })

  it('rejects malformed or null Origin headers', () => {
    expect(isSameOriginAiRequest(request({ origin: 'null', host: 'youju.example' }))).toBe(false)
    expect(isSameOriginAiRequest(request({ origin: 'not a url', host: 'youju.example' }))).toBe(false)
  })

  it('allows a matching same-origin Origin header', () => {
    expect(
      isSameOriginAiRequest(request({ origin: 'https://youju.example', host: 'youju.example' })),
    ).toBe(true)
    expect(
      isSameOriginAiRequest(
        request({ origin: 'http://127.0.0.1:4173', host: '127.0.0.1:4173' }, 'http'),
      ),
    ).toBe(true)
  })

  it('allows non-browser requests without Origin or cross-site metadata', () => {
    expect(isSameOriginAiRequest(request({ host: '127.0.0.1:3000' }, 'http'))).toBe(true)
    expect(
      isSameOriginAiRequest(request({ 'sec-fetch-site': 'same-origin', host: '127.0.0.1:3000' }, 'http')),
    ).toBe(true)
    expect(
      isSameOriginAiRequest(request({ 'sec-fetch-site': 'none', host: '127.0.0.1:3000' }, 'http')),
    ).toBe(true)
  })
})
