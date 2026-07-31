import {
  AnalysisVersionSchema,
  CaseEventSchema,
  ConfirmedFactSchema,
  ConfirmedStatementSchema,
  EvidenceFileSchema,
  FactCandidateSchema,
  FactDraftSchema,
  M2ErrorCodeSchema,
  MoneyAmountSchema,
  OperationJournalEntrySchema,
  StatementDraftSchema,
  TimelineEntrySchema,
} from '../src/index.js'
import type { SchemaVersion } from '../src/index.js'
import { Value } from '@sinclair/typebox/value'
import { describe, expect, it } from 'vitest'

const validSchemaVersion: SchemaVersion = 1

const validCase = {
  id: '00000000-0000-4000-8000-000000000001',
  scenarioType: 'ecommerce_refund',
  title: '运输破损退款纠纷',
  createdAt: '2026-07-29T10:00:00.000Z',
  updatedAt: '2026-07-29T10:00:00.000Z',
  status: 'draft',
  requestedResolution: null,
  storageMode: 'local',
  schemaVersion: validSchemaVersion,
}

const validCandidate = {
  id: '00000000-0000-4000-8000-000000000010',
  caseId: '00000000-0000-4000-8000-000000000001',
  factType: 'payment',
  fieldName: 'paid_amount',
  value: '899.00',
  normalizedValue: '89900',
  sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
  confidenceLevel: 'high',
  origin: 'ai',
  reviewStatus: 'pending',
  createdAt: '2026-07-29T10:00:00.000Z',
  analysisVersionId: '00000000-0000-4000-8000-000000000030',
}

const validConfirmedFact = {
  id: '00000000-0000-4000-8000-000000000011',
  caseId: '00000000-0000-4000-8000-000000000001',
  factType: 'payment',
  fieldName: 'paid_amount',
  value: '89900',
  sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
  confirmedAt: '2026-07-29T10:05:00.000Z',
  confirmationMethod: 'candidate_confirmed',
  derivedFromCandidateId: '00000000-0000-4000-8000-000000000010',
  replacesFactId: null,
  version: 1,
}

describe('domain schemas', () => {
  it('accepts a valid ecommerce refund case', () => {
    expect(Value.Check(CaseEventSchema, validCase)).toBe(true)
  })

  it('validates evidence identity, timestamps, hashes, and supported categories', () => {
    const evidence = {
      id: '00000000-0000-4000-8000-000000000020',
      caseId: '00000000-0000-4000-8000-000000000001',
      originalName: 'order.png',
      mediaType: 'image/png',
      size: 2048,
      sha256: 'a'.repeat(64),
      importedAt: '2026-07-29T10:01:00.000Z',
      sourceCreatedAt: null,
      category: 'order_record',
      storageRef: 'local://evidence/20',
      isOriginalPreserved: true,
      metadata: {},
    }

    expect(Value.Check(EvidenceFileSchema, evidence)).toBe(true)
    expect(Value.Check(EvidenceFileSchema, { ...evidence, sha256: 'not-a-sha256' })).toBe(false)
    expect(Value.Check(EvidenceFileSchema, { ...evidence, category: 'medical_record' })).toBe(false)
  })

  it('validates append-only analysis version records without storing credentials', () => {
    expect(
      Value.Check(AnalysisVersionSchema, {
        id: '00000000-0000-4000-8000-000000000030',
        caseId: '00000000-0000-4000-8000-000000000001',
        providerType: 'openai_compatible',
        baseUrlFingerprint: 'sha256:example-fingerprint',
        modelName: 'test-model',
        promptVersion: '1.0.0',
        schemaVersion: 1,
        startedAt: '2026-07-29T10:02:00.000Z',
        completedAt: null,
        status: 'running',
        errorCode: null,
      }),
    ).toBe(true)
  })

  it('rejects unsupported scenarios, invalid UUIDs, non-UTC times, and invalid schema versions', () => {
    expect(Value.Check(CaseEventSchema, { ...validCase, scenarioType: 'medical_dispute' })).toBe(
      false,
    )
    expect(Value.Check(CaseEventSchema, { ...validCase, id: 'case-1' })).toBe(false)
    expect(
      Value.Check(CaseEventSchema, { ...validCase, createdAt: '2026-07-29T18:00:00+08:00' }),
    ).toBe(false)
    expect(Value.Check(CaseEventSchema, { ...validCase, schemaVersion: 0 })).toBe(false)
    expect(Value.Check(CaseEventSchema, { ...validCase, schemaVersion: 1.5 })).toBe(false)
  })

  it('rejects impossible UTC calendar dates and accepts leap days', () => {
    expect(
      Value.Check(CaseEventSchema, {
        ...validCase,
        createdAt: '2026-02-31T10:00:00.000Z',
      }),
    ).toBe(false)
    expect(
      Value.Check(CaseEventSchema, {
        ...validCase,
        createdAt: '2024-02-29T10:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('accepts integer fen and fixed-point amount strings but rejects floating-point numbers', () => {
    expect(Value.Check(MoneyAmountSchema, 89900)).toBe(true)
    expect(Value.Check(MoneyAmountSchema, '899.00')).toBe(true)
    expect(Value.Check(MoneyAmountSchema, 899.5)).toBe(false)
  })

  it('enforces fixed-point strings for monetary candidate and confirmed fact values', () => {
    expect(Value.Check(FactCandidateSchema, { ...validCandidate, value: '899.123' })).toBe(false)
    expect(Value.Check(ConfirmedFactSchema, { ...validConfirmedFact, value: '899.123' })).toBe(
      false,
    )
  })

  it('restricts candidate review status to the approved values', () => {
    for (const reviewStatus of [
      'pending',
      'confirmed',
      'edited_and_confirmed',
      'rejected',
      'conflicted',
    ]) {
      expect(Value.Check(FactCandidateSchema, { ...validCandidate, reviewStatus })).toBe(true)
    }

    expect(
      Value.Check(FactCandidateSchema, { ...validCandidate, reviewStatus: 'auto_approved' }),
    ).toBe(false)
  })

  it('requires AI candidates to reference evidence and an analysis version', () => {
    expect(Value.Check(FactCandidateSchema, { ...validCandidate, sourceRefs: [] })).toBe(false)
    expect(Value.Check(FactCandidateSchema, { ...validCandidate, analysisVersionId: null })).toBe(
      false,
    )

    expect(
      Value.Check(FactCandidateSchema, {
        ...validCandidate,
        origin: 'rule',
        analysisVersionId: null,
      }),
    ).toBe(true)
  })

  it('rejects mismatched fact types and field names', () => {
    expect(
      Value.Check(FactCandidateSchema, {
        ...validCandidate,
        factType: 'order',
        fieldName: 'problem_description',
        value: '2026-07-29T10:00:00.000Z',
        normalizedValue: '2026-07-29T10:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('restricts timeline precision to the approved values', () => {
    const timelineEntry = {
      id: '00000000-0000-4000-8000-000000000040',
      caseId: '00000000-0000-4000-8000-000000000001',
      occurredAt: null,
      timePrecision: 'unknown',
      summary: '商家拒绝退款',
      detail: null,
      sourceRefs: [],
      status: 'draft',
      sortOrder: 1,
    }

    for (const timePrecision of ['minute', 'date', 'approximate', 'unknown']) {
      expect(Value.Check(TimelineEntrySchema, { ...timelineEntry, timePrecision })).toBe(true)
    }

    expect(
      Value.Check(TimelineEntrySchema, { ...timelineEntry, timePrecision: 'estimated_hour' }),
    ).toBe(false)
  })

  it('keeps candidate facts separate from user-confirmed formal facts', () => {
    expect(Value.Check(FactCandidateSchema, validCandidate)).toBe(true)
    expect(Value.Check(ConfirmedFactSchema, validConfirmedFact)).toBe(true)
    expect(Value.Check(ConfirmedFactSchema, validCandidate)).toBe(false)
    expect(Value.Check(FactCandidateSchema, validConfirmedFact)).toBe(false)
    expect(
      Value.Check(ConfirmedFactSchema, {
        ...validConfirmedFact,
        confirmedAt: undefined,
      }),
    ).toBe(false)
  })

  it('requires candidate-derived confirmed facts to retain their candidate provenance', () => {
    expect(
      Value.Check(ConfirmedFactSchema, {
        ...validConfirmedFact,
        derivedFromCandidateId: null,
      }),
    ).toBe(false)
    expect(
      Value.Check(ConfirmedFactSchema, {
        ...validConfirmedFact,
        confirmationMethod: 'candidate_edited',
        sourceRefs: [],
      }),
    ).toBe(false)
    expect(
      Value.Check(ConfirmedFactSchema, {
        ...validConfirmedFact,
        confirmationMethod: 'manual',
        derivedFromCandidateId: null,
        sourceRefs: [],
      }),
    ).toBe(true)
  })

  it('rejects legal conclusions, compensation, and success probability fields', () => {
    expect(Value.Check(CaseEventSchema, { ...validCase, legalConclusion: 'merchant_liable' })).toBe(
      false,
    )
    expect(
      Value.Check(ConfirmedFactSchema, { ...validConfirmedFact, compensationAmount: '179800' }),
    ).toBe(false)
    expect(
      Value.Check(FactCandidateSchema, { ...validCandidate, complaintSuccessRate: '90%' }),
    ).toBe(false)
  })

  it('validates manual fact drafts with positive revisions and rejects unknown fields', () => {
    const draft = {
      id: '00000000-0000-4000-8000-000000000501',
      caseId: validCase.id,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '89900',
      sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
      updatedAt: '2026-07-31T01:00:00.000Z',
      revision: 1,
    }

    expect(Value.Check(FactDraftSchema, draft)).toBe(true)
    expect(Value.Check(FactDraftSchema, { ...draft, revision: 0 })).toBe(false)
    expect(Value.Check(FactDraftSchema, { ...draft, unexpectedField: true })).toBe(false)
  })

  it('rejects invalid payment draft values and mismatched fact type and field name pairs', () => {
    const draft = {
      id: '00000000-0000-4000-8000-000000000501',
      caseId: validCase.id,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '89900',
      sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
      updatedAt: '2026-07-31T01:00:00.000Z',
      revision: 1,
    }

    expect(Value.Check(FactDraftSchema, { ...draft, value: '899.123' })).toBe(false)
    expect(
      Value.Check(FactDraftSchema, {
        ...draft,
        factType: 'order',
        fieldName: 'problem_description',
      }),
    ).toBe(false)
  })

  it('adds fieldName, replacement linkage, and version to confirmed facts', () => {
    expect(Value.Check(ConfirmedFactSchema, validConfirmedFact)).toBe(true)
    expect(
      Value.Check(ConfirmedFactSchema, { ...validConfirmedFact, fieldName: 'merchant_name' }),
    ).toBe(false)
    expect(Value.Check(ConfirmedFactSchema, { ...validConfirmedFact, version: 0 })).toBe(false)
    expect(
      Value.Check(ConfirmedFactSchema, { ...validConfirmedFact, replacesFactId: 'not-a-uuid' }),
    ).toBe(false)
  })

  it('validates statement drafts and confirmed statements with versioned references', () => {
    const statementDraft = {
      id: '00000000-0000-4000-8000-000000000701',
      caseId: validCase.id,
      content: '事实陈述草稿',
      confirmedFactIds: ['00000000-0000-4000-8000-000000000601'],
      confirmedTimelineEntryIds: ['00000000-0000-4000-8000-000000000040'],
      ruleVersion: '1.0.0',
      updatedAt: '2026-07-31T01:30:00.000Z',
      revision: 1,
    }
    const confirmedStatement = {
      id: '00000000-0000-4000-8000-000000000702',
      caseId: validCase.id,
      content: '已确认事实陈述',
      confirmedFactIds: ['00000000-0000-4000-8000-000000000601'],
      confirmedTimelineEntryIds: ['00000000-0000-4000-8000-000000000040'],
      ruleVersion: '1.0.0',
      confirmedAt: '2026-07-31T01:31:00.000Z',
      version: 1,
    }

    expect(Value.Check(StatementDraftSchema, statementDraft)).toBe(true)
    expect(Value.Check(StatementDraftSchema, { ...statementDraft, revision: 0 })).toBe(false)
    expect(Value.Check(StatementDraftSchema, { ...statementDraft, content: '' })).toBe(false)

    const draftWithoutFactIds = { ...statementDraft } as Record<string, unknown>
    delete draftWithoutFactIds.confirmedFactIds
    expect(Value.Check(StatementDraftSchema, draftWithoutFactIds)).toBe(false)

    expect(Value.Check(ConfirmedStatementSchema, confirmedStatement)).toBe(true)
    expect(Value.Check(ConfirmedStatementSchema, { ...confirmedStatement, version: 0 })).toBe(
      false,
    )

    const statementWithoutRuleVersion = { ...confirmedStatement } as Record<string, unknown>
    delete statementWithoutRuleVersion.ruleVersion
    expect(Value.Check(ConfirmedStatementSchema, statementWithoutRuleVersion)).toBe(false)
    expect(
      Value.Check(ConfirmedStatementSchema, { ...confirmedStatement, unexpectedField: true }),
    ).toBe(false)
  })

  it('accepts only discriminated operation journal variants and approved error codes', () => {
    const importOperation = {
      operationId: '00000000-0000-4000-8000-000000000801',
      caseId: validCase.id,
      evidenceId: '00000000-0000-4000-8000-000000000020',
      operationType: 'evidence_import',
      stage: 'committing',
      temporaryStorageRef: 'opfs://tmp/import-801',
      startedAt: '2026-07-31T02:00:00.000Z',
      errorCode: null,
    }
    const deleteOperation = {
      operationId: '00000000-0000-4000-8000-000000000802',
      caseId: validCase.id,
      evidenceId: '00000000-0000-4000-8000-000000000020',
      storageRef: 'opfs://evidence/20',
      operationType: 'evidence_delete',
      stage: 'verifying',
      startedAt: '2026-07-31T02:05:00.000Z',
      errorCode: 'delete_verification_failed',
    }
    const caseDeleteOperation = {
      operationId: '00000000-0000-4000-8000-000000000803',
      caseId: validCase.id,
      operationType: 'case_delete',
      stage: 'deleting',
      startedAt: '2026-07-31T02:06:00.000Z',
      errorCode: null,
    }
    const exportOperation = {
      operationId: '00000000-0000-4000-8000-000000000804',
      caseId: validCase.id,
      operationType: 'package_export',
      stage: 'preparing',
      temporaryStorageRef: 'opfs://tmp/export-804',
      startedAt: '2026-07-31T02:07:00.000Z',
      errorCode: null,
    }

    expect(Value.Check(OperationJournalEntrySchema, importOperation)).toBe(true)
    expect(Value.Check(OperationJournalEntrySchema, deleteOperation)).toBe(true)
    expect(Value.Check(OperationJournalEntrySchema, caseDeleteOperation)).toBe(true)
    expect(Value.Check(OperationJournalEntrySchema, exportOperation)).toBe(true)

    expect(
      Value.Check(OperationJournalEntrySchema, { ...importOperation, stage: 'preparing' }),
    ).toBe(false)
    expect(
      Value.Check(OperationJournalEntrySchema, { ...exportOperation, stage: 'deleting' }),
    ).toBe(false)
    expect(
      Value.Check(OperationJournalEntrySchema, {
        ...caseDeleteOperation,
        operationType: 'case_restore',
      }),
    ).toBe(false)
    expect(
      Value.Check(OperationJournalEntrySchema, { ...exportOperation, errorCode: 'unknown_error' }),
    ).toBe(false)
  })

  it('restricts M2 error codes to the approved stable codes', () => {
    for (const code of [
      'storage_not_supported',
      'storage_quota_exceeded',
      'file_type_mismatch',
      'file_too_large',
      'duplicate_evidence',
      'hash_mismatch',
      'concurrent_edit_conflict',
      'export_validation_failed',
      'delete_verification_failed',
    ]) {
      expect(Value.Check(M2ErrorCodeSchema, code)).toBe(true)
    }

    expect(Value.Check(M2ErrorCodeSchema, 'unknown_error')).toBe(false)
  })
})
