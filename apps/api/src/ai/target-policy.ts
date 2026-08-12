import { domainToASCII } from 'node:url'
import { isIP } from 'node:net'
import { PROVIDER_PRESETS, type ProviderPreset } from '@youju/ai-core'
import { isPublicAddress } from './address-policy.js'

export interface TargetInput {
  readonly providerPreset: ProviderPreset
  readonly baseUrl?: string
}

export interface NormalizedTarget {
  readonly protocol: 'https:'
  readonly hostname: string
  readonly port: 443
  readonly path: string
}

export interface DnsResolver {
  resolve(hostname: string): Promise<readonly { address: string; family: 4 | 6 }[]>
}

export interface AllowedTarget extends NormalizedTarget {
  readonly addresses: readonly { address: string; family: 4 | 6 }[]
}

function targetNotAllowed(): Error {
  return new Error('target_not_allowed')
}

function rejectControls(value: string): void {
  if ([...value].some((character) => character.charCodeAt(0) <= 0x20 || character.charCodeAt(0) === 0x7f)) {
    throw targetNotAllowed()
  }
}

function extractRawHostname(baseUrl: string): string {
  const authority = baseUrl.slice(baseUrl.indexOf('//') + 2).split(/[/?#]/, 1)[0] ?? ''
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1)
  if (hostPort.startsWith('[')) {
    return hostPort.slice(1, hostPort.indexOf(']'))
  }
  return hostPort.replace(/:\d+$/, '')
}

function normalizeCustomBaseUrl(baseUrl: string): NormalizedTarget {
  rejectControls(baseUrl)
  if (baseUrl.includes('\\') || /(?:^|\/)\.\.(?:\/|$)|(?:^|\/)\.(?:\/|$)/.test(baseUrl) || /%(?:2e|2f|5c|00)/i.test(baseUrl)) {
    throw targetNotAllowed()
  }
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw targetNotAllowed()
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' && url.port !== '443' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw targetNotAllowed()
  }
  const rawHostname = extractRawHostname(baseUrl)
  if (
    rawHostname.length === 0 ||
    [...rawHostname].some((character) => character.charCodeAt(0) > 0x7f) ||
    rawHostname.endsWith('.')
  ) {
    throw targetNotAllowed()
  }
  const hostname = domainToASCII(url.hostname)
  if (hostname === '' || hostname !== url.hostname.toLowerCase() || hostname.includes(':')) {
    throw targetNotAllowed()
  }
  if (url.hostname !== rawHostname.toLowerCase() || isIP(url.hostname) !== 0) {
    throw targetNotAllowed()
  }
  const normalizedPath = url.pathname.toLowerCase().replace(/\/$/, '')
  if (normalizedPath.endsWith('/chat/completions') || normalizedPath.endsWith('/responses')) {
    throw targetNotAllowed()
  }
  if (/(^|\/)\.\.?($|\/)/.test(url.pathname)) {
    throw targetNotAllowed()
  }
  const prefix = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  return {
    protocol: 'https:',
    hostname,
    port: 443,
    path: `${prefix}/chat/completions`,
  }
}

export function normalizeTarget(input: TargetInput): NormalizedTarget {
  if (input.providerPreset !== 'custom') {
    if (input.baseUrl !== undefined) {
      throw targetNotAllowed()
    }
    const endpoint = PROVIDER_PRESETS[input.providerPreset].endpoint
    if (endpoint === null) {
      throw targetNotAllowed()
    }
    const url = new URL(endpoint)
    return {
      protocol: 'https:',
      hostname: domainToASCII(url.hostname),
      port: 443,
      path: url.pathname,
    }
  }
  if (input.baseUrl === undefined) {
    throw targetNotAllowed()
  }
  return normalizeCustomBaseUrl(input.baseUrl)
}

export async function resolveAllowedTarget(
  input: TargetInput,
  resolver: DnsResolver,
): Promise<AllowedTarget> {
  const target = normalizeTarget(input)
  const addresses = await resolver.resolve(target.hostname)
  if (
    addresses.length === 0 ||
    addresses.some((address) => !((address.family === 4 || address.family === 6) && isPublicAddress(address.address)))
  ) {
    throw targetNotAllowed()
  }
  return { ...target, addresses: addresses.map((address) => ({ ...address })) }
}
