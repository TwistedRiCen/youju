import {
  buildCandidateConfirmedFact,
  buildManualConfirmedFact,
  confirmManualFact,
  replaceConfirmedFact,
  requiresEvidenceSource,
  selectCurrentConfirmedFacts,
} from '../src/index.js'
import type { ConfirmedFact, FactCandidate, FactDraft } from '../src/index.js'
import { describe, expect, it } from 'vitest'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000020'

interface PaymentDraftShape {
  id: string
  caseId: string
  factType: 'payment'
  fieldName: 'paid_amount'
  value: string
  sourceRefs: { evidenceId: string }[]
  updatedAt: string
  revision: number
}

interface OrderDraftShape {
  id: string
  caseId: string
  factType: 'order'
  fieldName: 'purchase_time'
  value: string
  sourceRefs: { evidenceId: string }[]
  updatedAt: string
  revision: number
}

function paymentDraft(overrides: Partial<PaymentDraftShape> = {}): FactDraft {
  return {
    id: '00000000-0000-4000-8000-000000000501',
    caseId,
    factType: 'payment',
    fieldName: 'paid_amount',
    value: '89900',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

function orderDraft(overrides: Partial<OrderDraftShape> = {}): FactDraft {
  return {
    id: '00000000-0000-4000-8000-000000000511',
    caseId,
    factType: 'order',
    fieldName: 'purchase_time',
    value: '2026-07-01T12:16:00.000Z',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:00:00.000Z',
    revision: 1,
    ...overrides,
  }
}

describe('manual fact confirmation lifecycle', () => {
  it('creates the first confirmed version from a manual draft', () => {
    const confirmed = confirmManualFact({
      draft: paymentDraft(),
      id: '00000000-0000-4000-8000-000000000601',
      confirmedAt: '2026-07-31T01:01:00.000Z',
    })

    expect(confirmed).toMatchObject({
      id: '00000000-0000-4000-8000-000000000601',
      caseId,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '89900',
      sourceRefs: [{ evidenceId }],
      confirmedAt: '2026-07-31T01:01:00.000Z',
      confirmationMethod: 'manual',
      derivedFromCandidateId: null,
      replacesFactId: null,
      version: 1,
    })
  })

  it('does not mutate the input draft', () => {
    const draft = paymentDraft()
    const before = structuredClone(draft)

    confirmManualFact({
      draft,
      id: '00000000-0000-4000-8000-000000000601',
      confirmedAt: '2026-07-31T01:01:00.000Z',
    })

    expect(draft).toEqual(before)
  })

  it('creates a replacement version linked to the superseded fact', () => {
    const current = confirmManualFact({
      draft: paymentDraft(),
      id: '00000000-0000-4000-8000-000000000601',
      confirmedAt: '2026-07-31T01:01:00.000Z',
    })
    const replacement = replaceConfirmedFact({
      current,
      draft: paymentDraft({
        value: '90000',
        updatedAt: '2026-07-31T01:10:00.000Z',
        revision: 2,
      }),
      id: '00000000-0000-4000-8000-000000000602',
      confirmedAt: '2026-07-31T01:11:00.000Z',
    })

    expect(replacement).toMatchObject({
      id: '00000000-0000-4000-8000-000000000602',
      value: '90000',
      confirmationMethod: 'manual',
      derivedFromCandidateId: null,
      replacesFactId: '00000000-0000-4000-8000-000000000601',
      version: 2,
    })
    expect(current.version).toBe(1)
    expect(current.replacesFactId).toBeNull()
  })

  it('keeps independent same-field facts visible for later conflict detection', () => {
    const first = confirmManualFact({
      draft: paymentDraft({ value: '89900' }),
      id: '00000000-0000-4000-8000-000000000601',
      confirmedAt: '2026-07-31T01:01:00.000Z',
    })
    const second = confirmManualFact({
      draft: paymentDraft({ value: '90000' }),
      id: '00000000-0000-4000-8000-000000000603',
      confirmedAt: '2026-07-31T01:02:00.000Z',
    })

    expect(selectCurrentConfirmedFacts([first, second])).toHaveLength(2)
  })

  it('excludes superseded facts and orders by field name, version, then id', () => {
    const first = confirmManualFact({
      draft: paymentDraft(),
      id: '00000000-0000-4000-8000-000000000610',
      confirmedAt: '2026-07-31T01:01:00.000Z',
    })
    const second = confirmManualFact({
      draft: orderDraft(),
      id: '00000000-0000-4000-8000-000000000611',
      confirmedAt: '2026-07-31T01:02:00.000Z',
    })
    const replacement = replaceConfirmedFact({
      current: first,
      draft: paymentDraft({ value: '90500' }),
      id: '00000000-0000-4000-8000-000000000612',
      confirmedAt: '2026-07-31T01:03:00.000Z',
    })

    const currentFacts: ConfirmedFact[] = selectCurrentConfirmedFacts([
      first,
      second,
      replacement,
    ])

    expect(currentFacts.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000612',
      '00000000-0000-4000-8000-000000000611',
    ])
  })

  it('does not mutate the input fact array', () => {
    const first = confirmManualFact({
      draft: paymentDraft(),
      id: '00000000-0000-4000-8000-000000000601',
      confirmedAt: '2026-07-31T01:01:00.000Z',
    })
    const facts = [first]
    const before = structuredClone(facts)

    selectCurrentConfirmedFacts(facts)

    expect(facts).toEqual(before)
  })
})

describe('required evidence source policy', () => {
  it('requires evidence sources for transactional fields', () => {
    expect(requiresEvidenceSource('purchase_time')).toBe(true)
    expect(requiresEvidenceSource('merchant_name')).toBe(true)
    expect(requiresEvidenceSource('product_name')).toBe(true)
    expect(requiresEvidenceSource('paid_amount')).toBe(true)
    expect(requiresEvidenceSource('order_number')).toBe(true)
    expect(requiresEvidenceSource('platform_name')).toBe(true)
    expect(requiresEvidenceSource('received_time')).toBe(true)
    expect(requiresEvidenceSource('merchant_response')).toBe(true)
  })

  it('allows problem description and requested resolution without evidence', () => {
    expect(requiresEvidenceSource('problem_description')).toBe(false)
    expect(requiresEvidenceSource('requested_resolution')).toBe(false)
  })
})

describe('manual confirmed fact builder', () => {
  it('builds a replacement with explicit sources, linkage and version', () => {
    const confirmed = buildManualConfirmedFact({
      draft: paymentDraft(),
      id: '00000000-0000-4000-8000-000000000602',
      confirmedAt: '2026-07-31T02:00:00.000Z',
      sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
      replacesFactId: '00000000-0000-4000-8000-000000000601',
      version: 3,
    })

    expect(confirmed).toMatchObject({
      id: '00000000-0000-4000-8000-000000000602',
      caseId,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '89900',
      sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
      confirmedAt: '2026-07-31T02:00:00.000Z',
      confirmationMethod: 'manual',
      derivedFromCandidateId: null,
      replacesFactId: '00000000-0000-4000-8000-000000000601',
      version: 3,
    })
  })
})

describe('candidate confirmed fact builder', () => {
  const candidate: FactCandidate = {
    id: '00000000-0000-4000-8000-000000000010',
    caseId,
    factType: 'payment',
    fieldName: 'paid_amount',
    value: '899.00',
    normalizedValue: '89900',
    sourceRefs: [{ evidenceId }],
    confidenceLevel: 'needs_confirmation',
    origin: 'ai',
    reviewStatus: 'confirmed',
    createdAt: '2026-07-31T02:10:00.000Z',
    analysisVersionId: '00000000-0000-4000-8000-000000000030',
  }

  it('converts an AI candidate into a confirmed fact with candidate provenance', () => {
    const confirmed = buildCandidateConfirmedFact({
      candidate,
      id: '00000000-0000-4000-8000-000000000620',
      confirmedAt: '2026-07-31T02:11:00.000Z',
      replacesFactId: null,
      version: 1,
    })

    expect(confirmed).toMatchObject({
      id: '00000000-0000-4000-8000-000000000620',
      caseId,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '89900',
      sourceRefs: [{ evidenceId }],
      confirmationMethod: 'candidate_confirmed',
      derivedFromCandidateId: candidate.id,
      replacesFactId: null,
      version: 1,
    })
  })

  it('uses the edited value and edited confirmation provenance when supplied', () => {
    const confirmed = buildCandidateConfirmedFact({
      candidate,
      editedValue: '90000',
      id: '00000000-0000-4000-8000-000000000621',
      confirmedAt: '2026-07-31T02:12:00.000Z',
      replacesFactId: '00000000-0000-4000-8000-000000000620',
      version: 2,
    })

    expect(confirmed).toMatchObject({
      value: '90000',
      confirmationMethod: 'candidate_edited',
      derivedFromCandidateId: candidate.id,
      replacesFactId: '00000000-0000-4000-8000-000000000620',
      version: 2,
    })
  })
})
