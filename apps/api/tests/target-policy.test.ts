import { describe, expect, it, vi } from 'vitest'
import { normalizeTarget, resolveAllowedTarget } from '../src/ai/target-policy.js'

const publicResolver = {
  resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
}

describe('AI target policy', () => {
  it('normalizes a custom HTTPS Base URL to the fixed chat completions operation', async () => {
    const target = await resolveAllowedTarget(
      { providerPreset: 'custom', baseUrl: 'https://example.com/v1/' },
      publicResolver,
    )

    expect(target).toEqual({
      protocol: 'https:',
      hostname: 'example.com',
      port: 443,
      path: '/v1/chat/completions',
      addresses: [{ address: '93.184.216.34', family: 4 }],
    })
    expect(publicResolver.resolve).toHaveBeenCalledWith('example.com')
  })

  it('uses fixed official preset endpoints and does not accept a user Base URL', () => {
    expect(normalizeTarget({ providerPreset: 'openai' })).toEqual({
      protocol: 'https:',
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/responses',
    })
    expect(() => normalizeTarget({
      providerPreset: 'openai',
      baseUrl: 'https://example.com/v1',
    })).toThrow('target_not_allowed')
  })

  it.each([
    ['http', 'http://example.com/v1'],
    ['non-443 port', 'https://example.com:8443/v1'],
    ['username', 'https://user@example.com/v1'],
    ['password', 'https://user:password@example.com/v1'],
    ['query', 'https://example.com/v1?mode=test'],
    ['fragment', 'https://example.com/v1#fragment'],
    ['IPv4 literal', 'https://93.184.216.34/v1'],
    ['IPv6 literal', 'https://[2001:db8::1]/v1'],
    ['backslash', 'https://example.com/v1\\next'],
    ['dot segment', 'https://example.com/v1/../private'],
    ['encoded dot segment', 'https://example.com/v1/%2e%2e/private'],
    ['control character', 'https://example.com/v1/\u0007'],
    ['Unicode hostname', 'https://例子.example/v1'],
    ['operation path', 'https://example.com/v1/chat/completions'],
    ['operation path with trailing slash', 'https://example.com/v1/chat/completions/'],
  ])('rejects a disallowed custom target: %s', (_label, baseUrl) => {
    expect(() => normalizeTarget({ providerPreset: 'custom', baseUrl })).toThrow('target_not_allowed')
  })

  it('rejects a DNS answer set when any address is disallowed', async () => {
    const resolver = {
      resolve: vi.fn(async () => [
        { address: '93.184.216.34', family: 4 as const },
        { address: '127.0.0.1', family: 4 as const },
      ]),
    }

    await expect(resolveAllowedTarget(
      { providerPreset: 'custom', baseUrl: 'https://example.com/v1' },
      resolver,
    )).rejects.toThrow('target_not_allowed')
  })
})
