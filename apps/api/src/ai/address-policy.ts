import { isIP } from 'node:net'

const IPV4_MAPPED_PREFIX = [0, 0, 0, 0, 0, 0xffff]

function parseIpv4(address: string): readonly number[] | null {
  const octets = address.split('.')
  if (octets.length !== 4) {
    return null
  }
  const parsed = octets.map((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return -1
    }
    const value = Number(octet)
    return value > 255 ? -1 : value
  })
  return parsed.every((octet) => octet >= 0) ? parsed : null
}

function parseIpv6Groups(address: string): readonly number[] | null {
  if (address.includes('%')) {
    return null
  }
  const halves = address.toLowerCase().split('::')
  if (halves.length > 2) {
    return null
  }

  const parsePart = (part: string): number[] | null => {
    if (part.length === 0) {
      return []
    }
    const chunks = part.split(':')
    const groups: number[] = []
    for (const chunk of chunks) {
      if (chunk.includes('.')) {
        const ipv4 = parseIpv4(chunk)
        if (ipv4 === null || groups.length !== chunks.length - 1) {
          return null
        }
        groups.push((ipv4[0]! << 8) | ipv4[1]!, (ipv4[2]! << 8) | ipv4[3]!)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(chunk)) {
        return null
      }
      groups.push(Number.parseInt(chunk, 16))
    }
    return groups
  }

  const left = parsePart(halves[0] ?? '')
  const right = parsePart(halves[1] ?? '')
  if (left === null || right === null) {
    return null
  }
  if (halves.length === 1) {
    return left.length === 8 ? left : null
  }
  const missing = 8 - left.length - right.length
  return missing > 0 ? [...left, ...Array.from({ length: missing }, () => 0), ...right] : null
}

function ipv6Value(groups: readonly number[]): bigint {
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n)
}

function prefixValue(prefix: string): { value: bigint; bits: number } {
  const [address, bitText] = prefix.split('/')
  if (address === undefined || bitText === undefined) {
    throw new Error('invalid_ipv6_prefix')
  }
  const groups = parseIpv6Groups(address)
  if (groups === null) {
    throw new Error('invalid_ipv6_prefix')
  }
  return { value: ipv6Value(groups), bits: Number(bitText) }
}

function isInIpv6Prefix(value: bigint, prefix: string): boolean {
  const { value: prefixNumber, bits } = prefixValue(prefix)
  const shift = 128 - bits
  return (value >> BigInt(shift)) === (prefixNumber >> BigInt(shift))
}

function isDisallowedIpv4(address: string): boolean {
  const octets = parseIpv4(address)
  if (octets === null) {
    return true
  }
  const value = ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0
  const inRange = (start: number, end: number) => value >= start && value <= end
  return (
    inRange(0x00000000, 0x00ffffff) ||
    inRange(0x0a000000, 0x0affffff) ||
    inRange(0x64400000, 0x647fffff) ||
    inRange(0x7f000000, 0x7fffffff) ||
    inRange(0xa9fe0000, 0xa9feffff) ||
    inRange(0xac100000, 0xac1fffff) ||
    inRange(0xc0000000, 0xc00000ff) ||
    inRange(0xc0000200, 0xc00002ff) ||
    inRange(0xc0586300, 0xc05863ff) ||
    inRange(0xc0a80000, 0xc0a8ffff) ||
    inRange(0xc6120000, 0xc613ffff) ||
    inRange(0xc6336400, 0xc63364ff) ||
    inRange(0xcb007100, 0xcb0071ff) ||
    inRange(0xe0000000, 0xffffffff)
  )
}

function isDisallowedIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address)
  if (groups === null) {
    return true
  }
  if (groups.slice(0, 6).every((group, index) => group === IPV4_MAPPED_PREFIX[index])) {
    const mapped = `${groups[6]!.toString(16).padStart(4, '0')}${groups[7]!.toString(16).padStart(4, '0')}`
    const ipv4 = `${Number.parseInt(mapped.slice(0, 2), 16)}.${Number.parseInt(mapped.slice(2, 4), 16)}.${Number.parseInt(mapped.slice(4, 6), 16)}.${Number.parseInt(mapped.slice(6, 8), 16)}`
    return isDisallowedIpv4(ipv4)
  }
  const value = ipv6Value(groups)
  return [
    '::/128',
    '::1/128',
    '100::/64',
    '2001::/32',
    '2001:2::/48',
    '2001:10::/28',
    '2001:20::/28',
    '2001:db8::/32',
    '3fff::/20',
    '64:ff9b::/96',
    'fc00::/7',
    'fe80::/10',
    'ff00::/8',
  ].some((prefix) => isInIpv6Prefix(value, prefix))
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    return !isDisallowedIpv4(address)
  }
  if (family === 6) {
    return !isDisallowedIpv6(address)
  }
  return false
}
