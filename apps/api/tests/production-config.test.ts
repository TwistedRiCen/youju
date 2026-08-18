import { describe, expect, it } from 'vitest'
import { parseProductionConfig } from '../src/production-config.js'

describe('production config', () => {
  it('parses an explicit trusted proxy list and validated release ID', () => {
    const config = parseProductionConfig({
      NODE_ENV: 'production',
      RELEASE_ID: '2026.08.18-1',
      TRUSTED_PROXY_CIDRS: '10.0.0.1, 2001:db8::1, 172.16.0.0/12',
    })
    expect(config.releaseId).toBe('2026.08.18-1')
    expect(config.trustedProxyCidrs).toEqual(['10.0.0.1', '2001:db8::1', '172.16.0.0/12'])
  })

  it('rejects boolean, wildcard, empty and malformed proxy values', () => {
    for (const value of [
      'true',
      '*',
      '',
      '   ',
      '10.0.0.0/99',
      '10.0.0.1/33',
      '2001:db8::1/129',
      'not-an-ip',
      '10.0.0.1,',
      '0.0.0.0/0',
      '::/0',
      '0.0.0.0/00',
      '10.0.0.1:8080',
      '10.0.0.1, nope',
    ]) {
      expect(
        () =>
          parseProductionConfig({
            NODE_ENV: 'production',
            RELEASE_ID: '2026.08.18-1',
            TRUSTED_PROXY_CIDRS: value,
          }),
        `expected proxy value ${JSON.stringify(value)} to be rejected`,
      ).toThrow()
    }
  })

  it('accepts mixed families, IPv4-mapped and uppercase entries', () => {
    const config = parseProductionConfig({
      NODE_ENV: 'production',
      RELEASE_ID: '2026.08.18-1',
      TRUSTED_PROXY_CIDRS: '10.0.0.1, ::ffff:10.0.0.2, 2001:DB8::1, 172.16.0.0/12',
    })
    expect(config.trustedProxyCidrs).toEqual([
      '10.0.0.1',
      '::ffff:10.0.0.2',
      '2001:DB8::1',
      '172.16.0.0/12',
    ])
  })

  it('rejects missing or malformed release IDs', () => {
    for (const value of ['', ' ', 'bad release', 'x'.repeat(81), '../etc', 'a/b']) {
      expect(
        () =>
          parseProductionConfig({
            NODE_ENV: 'production',
            RELEASE_ID: value,
            TRUSTED_PROXY_CIDRS: '10.0.0.1',
          }),
        `expected release id ${JSON.stringify(value)} to be rejected`,
      ).toThrow()
    }
  })

  it('requires every production value to be present and explicit', () => {
    expect(() => parseProductionConfig({ NODE_ENV: 'production' })).toThrow()
    expect(() =>
      parseProductionConfig({ NODE_ENV: 'production', RELEASE_ID: '2026.08.18-1' }),
    ).toThrow()
    expect(() =>
      parseProductionConfig({ NODE_ENV: 'production', TRUSTED_PROXY_CIDRS: '10.0.0.1' }),
    ).toThrow()
  })
})
