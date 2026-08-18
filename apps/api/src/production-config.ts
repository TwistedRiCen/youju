import { isIP } from 'node:net'

export interface ProductionConfig {
  readonly releaseId: string
  readonly trustedProxyCidrs: readonly string[]
}

const RELEASE_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/

function parseCidrEntry(value: string): void {
  const slash = value.indexOf('/')
  if (slash === -1) {
    if (isIP(value) === 0) {
      throw new Error(`not an IP address: ${value}`)
    }
    return
  }
  const address = value.slice(0, slash)
  const prefix = value.slice(slash + 1)
  const family = isIP(address)
  if (family === 0 || !/^\d{1,3}$/.test(prefix)) {
    throw new Error(`malformed CIDR: ${value}`)
  }
  const bits = Number(prefix)
  const maximum = family === 4 ? 32 : 128
  if (bits <= 0 || bits > maximum) {
    throw new Error(`invalid or wildcard prefix length: ${value}`)
  }
}

export function parseProductionConfig(env: NodeJS.ProcessEnv): ProductionConfig {
  const releaseId = env.RELEASE_ID
  if (releaseId === undefined || !RELEASE_ID_PATTERN.test(releaseId)) {
    throw new Error('RELEASE_ID must be a validated release identifier in production')
  }

  const rawCidrs = env.TRUSTED_PROXY_CIDRS
  if (rawCidrs === undefined || rawCidrs.trim() === '') {
    throw new Error('TRUSTED_PROXY_CIDRS must be an explicit comma-separated proxy list in production')
  }
  const entries = rawCidrs.split(',').map((entry) => entry.trim())
  if (entries.some((entry) => entry === '')) {
    throw new Error('TRUSTED_PROXY_CIDRS contains an empty entry')
  }
  for (const entry of entries) {
    parseCidrEntry(entry)
  }

  return { releaseId, trustedProxyCidrs: entries }
}
