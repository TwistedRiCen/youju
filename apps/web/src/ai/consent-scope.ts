import type { AiProtocol, ProviderCapabilities, ProviderPreset } from '@youju/ai-core'
import type { UuidV4 } from '@youju/domain'

export interface ConsentEvidencePages {
  readonly evidenceId: UuidV4
  readonly pages: readonly number[]
}

export interface ConsentScope {
  readonly caseId: UuidV4
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrlFingerprint: string
  readonly modelName: string
  readonly selectedEvidencePages: readonly ConsentEvidencePages[]
  readonly textFieldNames: readonly string[]
  readonly securityPolicyVersion: string
  readonly maxDerivedBytes: number
  readonly capabilities: ProviderCapabilities
  readonly capabilityTestedAt: string
}

interface NormalizedConsentScope {
  readonly caseId: UuidV4
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrlFingerprint: string
  readonly modelName: string
  readonly selectedEvidencePages: ReadonlyMap<UuidV4, ReadonlySet<number>>
  readonly textFieldNames: ReadonlySet<string>
  readonly securityPolicyVersion: string
  readonly maxDerivedBytes: number
  readonly capabilities: ProviderCapabilities
  readonly capabilityTestedAt: string
}

function normalizeScope(scope: ConsentScope): NormalizedConsentScope {
  const selectedEvidencePages = new Map<UuidV4, ReadonlySet<number>>()
  for (const selection of scope.selectedEvidencePages) {
    const pages = new Set(selectedEvidencePages.get(selection.evidenceId) ?? [])
    for (const page of selection.pages) {
      pages.add(page)
    }
    selectedEvidencePages.set(selection.evidenceId, pages)
  }

  return {
    caseId: scope.caseId,
    providerPreset: scope.providerPreset,
    protocol: scope.protocol,
    baseUrlFingerprint: scope.baseUrlFingerprint,
    modelName: scope.modelName,
    selectedEvidencePages,
    textFieldNames: new Set(scope.textFieldNames),
    securityPolicyVersion: scope.securityPolicyVersion,
    maxDerivedBytes: scope.maxDerivedBytes,
    capabilities: { ...scope.capabilities },
    capabilityTestedAt: scope.capabilityTestedAt,
  }
}

function hasSubset<T>(subset: ReadonlySet<T>, superset: ReadonlySet<T>): boolean {
  for (const value of subset) {
    if (!superset.has(value)) {
      return false
    }
  }
  return true
}

function hasEvidencePageSubset(
  subset: ReadonlyMap<UuidV4, ReadonlySet<number>>,
  superset: ReadonlyMap<UuidV4, ReadonlySet<number>>,
): boolean {
  for (const [evidenceId, pages] of subset) {
    const approvedPages = superset.get(evidenceId)
    if (approvedPages === undefined || !hasSubset(pages, approvedPages)) {
      return false
    }
  }
  return true
}

function hasSameCapabilities(left: ProviderCapabilities, right: ProviderCapabilities): boolean {
  return (
    left.text === right.text &&
    left.vision === right.vision &&
    left.jsonMode === right.jsonMode &&
    left.jsonSchema === right.jsonSchema &&
    left.streaming === right.streaming
  )
}

export function isConsentScopeWithin(
  next: ConsentScope,
  approved: ConsentScope,
): boolean {
  const candidate = normalizeScope(next)
  const original = normalizeScope(approved)

  return (
    candidate.caseId === original.caseId &&
    candidate.providerPreset === original.providerPreset &&
    candidate.protocol === original.protocol &&
    candidate.baseUrlFingerprint === original.baseUrlFingerprint &&
    candidate.modelName === original.modelName &&
    candidate.securityPolicyVersion === original.securityPolicyVersion &&
    candidate.capabilityTestedAt === original.capabilityTestedAt &&
    candidate.maxDerivedBytes <= original.maxDerivedBytes &&
    hasSubset(candidate.textFieldNames, original.textFieldNames) &&
    hasEvidencePageSubset(candidate.selectedEvidencePages, original.selectedEvidencePages) &&
    hasSameCapabilities(candidate.capabilities, original.capabilities)
  )
}

export function cloneConsentScope(scope: ConsentScope): ConsentScope {
  return {
    ...scope,
    selectedEvidencePages: scope.selectedEvidencePages.map((selection) => ({
      evidenceId: selection.evidenceId,
      pages: [...selection.pages],
    })),
    textFieldNames: [...scope.textFieldNames],
    capabilities: { ...scope.capabilities },
  }
}
