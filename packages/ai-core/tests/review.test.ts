import {
  canBatchConfirm,
  localizeTaskOutput,
  transitionReview,
  type AiCandidate,
  type InputManifest,
  type ReviewContext,
} from '../src/index.js'
import { describe, expect, it } from 'vitest'

const caseId = '00000000-0000-4000-8000-000000000001'
const sourceToken = '00000000-0000-4000-8000-000000000501'
const createdAt = '2026-08-12T03:00:00.000Z'
const reviewedAt = '2026-08-12T03:10:00.000Z'

const manifest: InputManifest = {
  taskId: '00000000-0000-4000-8000-000000000401',
  caseId,
  title: '本地事件标题',
  taskType: 'extract_facts',
  providerPreset: 'aliyun_bailian',
  protocol: 'chat_completions',
  baseUrlFingerprint: 'sha256:fixture',
  modelName: 'fixture-model',
  items: [{
    sourceToken,
    evidenceId: '00000000-0000-4000-8000-000000000101',
    originalName: 'order.png',
    page: 1,
    derivedMediaType: 'image/webp',
    pixelWidth: 1600,
    pixelHeight: 2200,
    byteSize: 1024,
    derivedSha256: 'a'.repeat(64),
  }],
  batchCount: 1,
  totalDerivedBytes: 1024,
}

function candidate(overrides: Record<string, unknown> = {}): AiCandidate {
  const [localized] = localizeTaskOutput({
    analysisVersionId: '00000000-0000-4000-8000-000000000301',
    caseId,
    taskType: 'extract_facts',
    manifest,
    output: {
      facts: [{
        factType: 'payment',
        fieldName: 'paid_amount',
        value: '899.00',
        normalizedValue: '89900',
        confidenceLevel: 'high',
        sources: [{ sourceToken, page: 1 }],
      }],
      uncertainties: [],
      warnings: [],
    },
    createdAt,
    idFactory: () => '00000000-0000-4000-8000-000000000601',
  })
  return { ...localized, ...overrides } as AiCandidate
}

function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  const current = candidate()
  return {
    analysisStatus: 'completed',
    authorizedSources: current.sourceLocations,
    conflicts: [],
    materialsReady: true,
    schemaValid: true,
    ...overrides,
  }
}

describe('AI candidate review state machine', () => {
  it('allows batch confirmation only for a complete high-confidence candidate', () => {
    const current = candidate()
    expect(canBatchConfirm(current, context())).toBe(true)
    expect(canBatchConfirm({ ...current, confidenceLevel: 'needs_confirmation' }, context())).toBe(false)
    expect(canBatchConfirm(current, context({ analysisStatus: 'running' }))).toBe(false)
    expect(canBatchConfirm(current, context({ materialsReady: false }))).toBe(false)
    expect(canBatchConfirm(current, context({ schemaValid: false }))).toBe(false)
  })

  it('rejects high confidence when source completeness or authorization is missing', () => {
    const current = candidate()
    expect(canBatchConfirm({ ...current, sourceLocations: [] }, context())).toBe(false)
    expect(canBatchConfirm(current, context({ authorizedSources: [] }))).toBe(false)
    expect(canBatchConfirm(current, context({ conflicts: [{ candidateId: current.id, type: 'formal_fact_conflict' }] }))).toBe(false)
  })

  it('transitions a pending candidate to rejected and blocks later confirmation', () => {
    const rejected = transitionReview(candidate(), { type: 'reject', reviewedAt })
    expect(rejected).toMatchObject({ reviewStatus: 'rejected', reviewedAt })
    expect(() => transitionReview(rejected, { type: 'confirm', reviewedAt })).toThrow(
      'invalid_review_transition',
    )
  })

  it('allows a pending candidate to be confirmed or edited and confirmed', () => {
    expect(transitionReview(candidate(), { type: 'confirm', reviewedAt })).toMatchObject({
      reviewStatus: 'confirmed',
      reviewedAt,
    })
    expect(transitionReview(candidate(), { type: 'edit_and_confirm', reviewedAt })).toMatchObject({
      reviewStatus: 'edited_and_confirmed',
      reviewedAt,
    })
  })

  it('requires an explicit edit before resolving a conflicted candidate', () => {
    const conflicted = transitionReview(candidate(), {
      type: 'mark_conflicted',
      reviewedAt,
      conflictType: 'candidate_value_conflict',
    })
    expect(conflicted).toMatchObject({
      reviewStatus: 'conflicted',
      conflictType: 'candidate_value_conflict',
    })
    expect(() => transitionReview(conflicted, { type: 'confirm', reviewedAt })).toThrow(
      'invalid_review_transition',
    )
    expect(transitionReview(conflicted, { type: 'edit_and_confirm', reviewedAt })).toMatchObject({
      reviewStatus: 'edited_and_confirmed',
    })
  })

  it('does not allow completed candidates to be changed by a later review command', () => {
    const confirmed = transitionReview(candidate(), { type: 'confirm', reviewedAt })
    expect(() => transitionReview(confirmed, { type: 'reject', reviewedAt })).toThrow(
      'invalid_review_transition',
    )
  })
})
