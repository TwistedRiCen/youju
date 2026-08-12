import { describe, expect, it } from 'vitest'
import { isPublicAddress } from '../src/ai/address-policy.js'

describe('AI address policy', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('rejects disallowed IPv4 address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each([
    '::',
    '::1',
    '::ffff:192.168.1.1',
    '::ffff:7f00:1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2001:2::1',
    'ff02::1',
  ])('rejects disallowed IPv6 address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888'])('allows public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each(['not-an-ip', '192.0.2.999', '2001:::1', 'fe80::1%25eth0'])('rejects invalid or scoped address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })
})
