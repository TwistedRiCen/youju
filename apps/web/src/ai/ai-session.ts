import type { AiProtocol, ProviderCapabilities, ProviderPreset } from '@youju/ai-core'
import type { UtcTimestamp } from '@youju/domain'
import {
  cloneConsentScope,
  isConsentScopeWithin,
  type ConsentScope,
} from './consent-scope.js'

export interface ProviderSessionConfig {
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrl: string
  readonly modelName: string
  readonly apiKey: string
  readonly capabilities: ProviderCapabilities
  readonly consentMode: 'strict' | 'session_convenience'
  readonly connectionTestedAt: UtcTimestamp
}

let session: ProviderSessionConfig | null = null
let approvedConsent: ConsentScope | null = null

function cloneSession(config: ProviderSessionConfig): ProviderSessionConfig {
  return {
    ...config,
    capabilities: { ...config.capabilities },
  }
}

export function getAiSession(): ProviderSessionConfig | null {
  return session === null ? null : cloneSession(session)
}

export function setAiSession(config: ProviderSessionConfig): void {
  session = cloneSession(config)
  approvedConsent = null
}

export function disableAi(): void {
  session = null
  approvedConsent = null
}

export function getAiConsentMode(): 'strict' | 'session_convenience' {
  return session?.consentMode ?? 'strict'
}

export function recordConsent(scope: ConsentScope): void {
  approvedConsent = cloneConsentScope(scope)
}

export function requiresFullConsent(next: ConsentScope): boolean {
  return (
    session?.consentMode !== 'session_convenience' ||
    approvedConsent === null ||
    !isConsentScopeWithin(next, approvedConsent)
  )
}
