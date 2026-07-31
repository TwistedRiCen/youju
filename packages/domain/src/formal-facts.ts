import type {
  ConfirmedFact,
  FactDraft,
  FactFieldName,
  SourceReference,
  UuidV4,
  UtcTimestamp,
} from './schemas.js'

export interface ConfirmManualFactInput {
  readonly draft: FactDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
}

export interface ReplaceConfirmedFactInput {
  readonly current: ConfirmedFact
  readonly draft: FactDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
}

function confirmedFactFromDraft(
  draft: FactDraft,
  id: UuidV4,
  confirmedAt: UtcTimestamp,
  sourceRefs: readonly SourceReference[],
  replacesFactId: UuidV4 | null,
  version: number,
): ConfirmedFact {
  const base = {
    id,
    caseId: draft.caseId,
    sourceRefs: [...sourceRefs],
    confirmedAt,
    confirmationMethod: 'manual' as const,
    derivedFromCandidateId: null,
    replacesFactId,
    version,
  }

  switch (draft.factType) {
    case 'payment':
      return { ...base, factType: 'payment', fieldName: 'paid_amount', value: draft.value }
    case 'order':
      return { ...base, factType: 'order', fieldName: draft.fieldName, value: draft.value }
    case 'merchant':
      return { ...base, factType: 'merchant', fieldName: 'merchant_name', value: draft.value }
    case 'product':
      return { ...base, factType: 'product', fieldName: 'product_name', value: draft.value }
    case 'delivery':
      return { ...base, factType: 'delivery', fieldName: 'received_time', value: draft.value }
    case 'issue':
      return {
        ...base,
        factType: 'issue',
        fieldName: 'problem_description',
        value: draft.value,
      }
    case 'communication':
      return {
        ...base,
        factType: 'communication',
        fieldName: 'merchant_response',
        value: draft.value,
      }
    case 'resolution':
      return {
        ...base,
        factType: 'resolution',
        fieldName: 'requested_resolution',
        value: draft.value,
      }
  }
}

export function confirmManualFact(input: ConfirmManualFactInput): ConfirmedFact {
  return confirmedFactFromDraft(
    input.draft,
    input.id,
    input.confirmedAt,
    input.draft.sourceRefs,
    null,
    1,
  )
}

export function replaceConfirmedFact(input: ReplaceConfirmedFactInput): ConfirmedFact {
  return confirmedFactFromDraft(
    input.draft,
    input.id,
    input.confirmedAt,
    input.draft.sourceRefs,
    input.current.id,
    input.current.version + 1,
  )
}

export interface BuildManualConfirmedFactInput {
  readonly draft: FactDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
  readonly sourceRefs: readonly SourceReference[]
  readonly replacesFactId: UuidV4 | null
  readonly version: number
}

export function buildManualConfirmedFact(
  input: BuildManualConfirmedFactInput,
): ConfirmedFact {
  return confirmedFactFromDraft(
    input.draft,
    input.id,
    input.confirmedAt,
    input.sourceRefs,
    input.replacesFactId,
    input.version,
  )
}

export interface ConfirmFactCommand {
  readonly draftId: UuidV4
  readonly confirmedFactId: UuidV4
  readonly confirmedAt: UtcTimestamp
  readonly sourceRefs: readonly SourceReference[]
  readonly replacesFactId: UuidV4 | null
}

const STATEMENT_ONLY_FIELDS: ReadonlySet<FactFieldName> = new Set([
  'problem_description',
  'requested_resolution',
])

export function requiresEvidenceSource(fieldName: FactFieldName): boolean {
  return !STATEMENT_ONLY_FIELDS.has(fieldName)
}

export function selectCurrentConfirmedFacts(facts: readonly ConfirmedFact[]): ConfirmedFact[] {
  const replacedFactIds = new Set<string>()
  for (const fact of facts) {
    if (fact.replacesFactId !== null) {
      replacedFactIds.add(fact.replacesFactId)
    }
  }

  return facts
    .filter((fact) => !replacedFactIds.has(fact.id))
    .slice()
    .sort((a, b) => {
      if (a.fieldName !== b.fieldName) {
        return a.fieldName < b.fieldName ? -1 : 1
      }
      if (a.version !== b.version) {
        return a.version - b.version
      }
      if (a.id !== b.id) {
        return a.id < b.id ? -1 : 1
      }
      return 0
    })
}
