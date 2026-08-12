import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  disableAi,
  getAiConsentMode,
  getAiSession,
  recordConsent,
  requiresFullConsent,
  setAiSession,
} from '../src/ai/index.js'
import type { ConsentScope, ProviderSessionConfig } from '../src/ai/index.js'

const caseId = '00000000-0000-4000-8000-000000000401'
const evidenceId = '00000000-0000-4000-8000-000000000402'
const secondEvidenceId = '00000000-0000-4000-8000-000000000403'

const session: ProviderSessionConfig = {
  providerPreset: 'openai',
  protocol: 'responses',
  baseUrl: 'https://api.example.test/v1',
  modelName: 'fictional-model',
  apiKey: 'fictional-api-key-sentinel-task-7',
  capabilities: {
    text: true,
    vision: true,
    jsonMode: true,
    jsonSchema: true,
    streaming: true,
  },
  consentMode: 'session_convenience',
  connectionTestedAt: '2026-08-12T08:00:00.000Z',
}

const scope: ConsentScope = {
  caseId,
  providerPreset: 'openai',
  protocol: 'responses',
  baseUrlFingerprint: 'sha256:fictional-provider',
  modelName: 'fictional-model',
  selectedEvidencePages: [
    { evidenceId, pages: [1, 2] },
    { evidenceId: secondEvidenceId, pages: [1] },
  ],
  textFieldNames: ['issue_description', 'expected_resolution'],
  securityPolicyVersion: 'm3-security-1',
  maxDerivedBytes: 4_000_000,
  capabilities: session.capabilities,
  capabilityTestedAt: '2026-08-12T08:00:00.000Z',
}

afterEach(() => {
  disableAi()
})

describe('session-only BYOK configuration', () => {
  it('defaults to strict consent and retains the key only in page memory', () => {
    expect(getAiConsentMode()).toBe('strict')
    expect(getAiSession()).toBeNull()

    setAiSession(session)

    expect(getAiSession()).toMatchObject({
      providerPreset: 'openai',
      consentMode: 'session_convenience',
      apiKey: session.apiKey,
    })
    expect(getAiSession()).not.toBe(session)
  })

  it('clears the session and consent scope when AI is disabled', () => {
    setAiSession(session)
    recordConsent(scope)

    expect(requiresFullConsent(scope)).toBe(false)
    disableAi()
    expect(getAiSession()).toBeNull()
    expect(getAiConsentMode()).toBe('strict')
    expect(requiresFullConsent(scope)).toBe(true)
  })

  it('keeps strict consent per-task even after a scope has been recorded', () => {
    setAiSession({ ...session, consentMode: 'strict' })
    recordConsent(scope)

    expect(requiresFullConsent(scope)).toBe(true)
  })
})

describe('session convenience consent scope', () => {
  beforeEach(() => {
    setAiSession(session)
  })

  it('allows only a subset of the originally approved local scope', () => {
    recordConsent(scope)

    expect(requiresFullConsent({
      ...scope,
      selectedEvidencePages: [{ evidenceId, pages: [2] }],
      textFieldNames: ['issue_description'],
      maxDerivedBytes: 2_000_000,
      sourceToken: '00000000-0000-4000-8000-000000000499',
    } as ConsentScope & { sourceToken: string })).toBe(false)
  })

  it.each([
    ['case', { caseId: '00000000-0000-4000-8000-000000000499' }],
    ['provider', { providerPreset: 'deepseek' }],
    ['protocol', { protocol: 'chat_completions' }],
    ['base URL fingerprint', { baseUrlFingerprint: 'sha256:other-provider' }],
    ['model', { modelName: 'other-model' }],
    ['new page', { selectedEvidencePages: [{ evidenceId, pages: [1, 2, 3] }] }],
    ['new text field', { textFieldNames: ['issue_description', 'new_field'] }],
    ['larger derived payload', { maxDerivedBytes: 4_000_001 }],
    ['security policy', { securityPolicyVersion: 'm3-security-2' }],
    ['capability retest', { capabilityTestedAt: '2026-08-12T08:01:00.000Z' }],
    ['capability snapshot', {
      capabilities: { ...scope.capabilities, vision: false },
    }],
  ])('requires full consent after changing the %s', (_label, change) => {
    recordConsent(scope)
    expect(requiresFullConsent({ ...scope, ...change } as ConsentScope)).toBe(true)
  })

  it('does not bind consent to regenerated task-scoped source tokens', () => {
    recordConsent(scope)
    expect(requiresFullConsent({
      ...scope,
      taskSourceTokens: [
        '00000000-0000-4000-8000-000000000490',
        '00000000-0000-4000-8000-000000000491',
      ],
    } as ConsentScope & { taskSourceTokens: readonly string[] })).toBe(false)
  })
})
