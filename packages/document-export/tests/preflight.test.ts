import { describe, expect, it } from 'vitest'
import { validateExportSnapshot } from '../src/index.js'
import type {
  EvidenceExportItem,
  ExportSnapshot,
} from '../src/index.js'
import type {
  CaseEvent,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceFile,
  TimelineEntry,
} from '@youju/domain'
import type { RuleFinding } from '@youju/rule-engine'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'

const caseEvent: CaseEvent = {
  id: caseId,
  scenarioType: 'ecommerce_refund',
  title: '运输破损退款纠纷',
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
  status: 'in_progress',
  requestedResolution: '退货退款',
  storageMode: 'local',
  schemaVersion: 1,
}

function confirmedFact(
  id: string,
  fieldName:
    | 'purchase_time'
    | 'merchant_name'
    | 'product_name'
    | 'paid_amount'
    | 'problem_description'
    | 'requested_resolution',
  value: string,
  sourceRefs: readonly { evidenceId: string }[] = [],
): ConfirmedFact {
  const base = {
    id,
    caseId,
    value,
    sourceRefs: [...sourceRefs],
    confirmedAt: '2026-07-31T10:10:00.000Z',
    confirmationMethod: 'manual' as const,
    derivedFromCandidateId: null,
    replacesFactId: null,
    version: 1,
  }
  switch (fieldName) {
    case 'purchase_time':
      return { ...base, factType: 'order', fieldName: 'purchase_time' }
    case 'merchant_name':
      return { ...base, factType: 'merchant', fieldName: 'merchant_name' }
    case 'product_name':
      return { ...base, factType: 'product', fieldName: 'product_name' }
    case 'paid_amount':
      return { ...base, factType: 'payment', fieldName: 'paid_amount' }
    case 'problem_description':
      return { ...base, factType: 'issue', fieldName: 'problem_description' }
    case 'requested_resolution':
      return { ...base, factType: 'resolution', fieldName: 'requested_resolution' }
  }
}

const confirmedFacts: readonly ConfirmedFact[] = [
  confirmedFact('00000000-0000-4000-8000-000000000601', 'purchase_time', '2026-07-01T12:16:00.000Z', [{ evidenceId }]),
  confirmedFact('00000000-0000-4000-8000-000000000602', 'merchant_name', '晴川生活示例店', [{ evidenceId }]),
  confirmedFact('00000000-0000-4000-8000-000000000603', 'product_name', '便携折叠桌', [{ evidenceId }]),
  confirmedFact('00000000-0000-4000-8000-000000000604', 'paid_amount', '89900', [{ evidenceId }]),
  confirmedFact('00000000-0000-4000-8000-000000000605', 'problem_description', '包裹破损'),
  confirmedFact('00000000-0000-4000-8000-000000000606', 'requested_resolution', '退货退款'),
]

const confirmedTimeline: readonly TimelineEntry[] = [
  {
    id: '00000000-0000-4000-8000-000000000701',
    caseId,
    occurredAt: '2026-07-01T12:16:00.000Z',
    timePrecision: 'minute',
    summary: '下单',
    detail: null,
    sourceRefs: [],
    status: 'confirmed',
    sortOrder: 0,
  },
]

function statement(
  factIds: readonly string[] = confirmedFacts.map((fact) => fact.id),
  timelineIds: readonly string[] = confirmedTimeline.map((entry) => entry.id),
  ruleVersion = '1.0.0',
): ConfirmedStatement {
  return {
    id: '00000000-0000-4000-8000-000000000801',
    caseId,
    content: '事实陈述',
    confirmedFactIds: [...factIds],
    confirmedTimelineEntryIds: [...timelineIds],
    ruleVersion,
    confirmedAt: '2026-07-31T10:30:00.000Z',
    version: 1,
  }
}

const evidenceFile: EvidenceFile = {
  id: evidenceId,
  caseId,
  originalName: '订单.png',
  mediaType: 'image/png',
  size: 16,
  sha256: 'a'.repeat(64),
  importedAt: '2026-07-31T10:05:00.000Z',
  sourceCreatedAt: null,
  category: 'order_record',
  storageRef: `cases/${caseId}/evidence/${evidenceId}`,
  isOriginalPreserved: true,
  metadata: {},
}

const evidence: readonly EvidenceExportItem[] = [
  { metadata: evidenceFile, integrity: { status: 'verified', actualSha256: 'a'.repeat(64) } },
]

function finding(
  resultType: 'missing_fact' | 'missing_evidence',
  sourceReference: string,
): RuleFinding {
  const base = {
    ruleId: 'consumer.ecommerce.refund.basic',
    ruleVersion: '1.0.0',
    message: `提示：${sourceReference}`,
    relatedEvidenceIds: [],
    sourceReference,
  }
  if (resultType === 'missing_fact') {
    return { ...base, severity: 'blocking', resultType: 'missing_fact' }
  }
  return { ...base, severity: 'warning', resultType: 'missing_evidence' }
}

function validSnapshot(): ExportSnapshot {
  return {
    caseEvent,
    confirmedFacts,
    confirmedTimeline,
    statement: statement(),
    findings: [finding('missing_evidence', 'stable-method:payment-record')],
    evidence,
    conflicts: [],
    generatedAt: '2026-07-31T10:40:00.000Z',
    appVersion: '0.1.0',
    opfsAvailable: true,
  }
}

describe('export preflight', () => {
  it('is ready with warning-only missing recommended evidence', () => {
    expect(validateExportSnapshot(validSnapshot())).toEqual({
      status: 'ready',
      warnings: [{ code: 'recommended_evidence_missing', evidenceCategory: 'payment_record' }],
    })
  })

  it('blocks a stale statement', () => {
    const snapshot = validSnapshot()
    const staleStatement = statement([
      '00000000-0000-4000-8000-000000000900',
      ...confirmedFacts.slice(1).map((fact) => fact.id),
    ])

    expect(validateExportSnapshot({ ...snapshot, statement: staleStatement })).toEqual({
      status: 'blocked',
      reasons: [{ code: 'statement_stale' }],
      warnings: expect.any(Array),
    })
  })

  it('blocks a missing required fact', () => {
    const snapshot = validSnapshot()
    const modified = {
      ...snapshot,
      findings: [
        ...snapshot.findings,
        finding('missing_fact', 'stable-method:required-fact:purchase_time'),
      ],
    }

    const result = validateExportSnapshot(modified)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.reasons).toContainEqual({
        code: 'missing_required_fact',
        fieldName: 'purchase_time',
      })
    }
  })

  it('blocks a required source absent on a transactional fact', () => {
    const snapshot = validSnapshot()
    const modified = {
      ...snapshot,
      confirmedFacts: confirmedFacts.map((fact, index) =>
        index === 1 ? { ...fact, sourceRefs: [] } : fact,
      ),
    }

    const result = validateExportSnapshot(modified)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.reasons).toContainEqual({
        code: 'missing_required_source',
        confirmedFactId: '00000000-0000-4000-8000-000000000602',
      })
    }
  })

  it('blocks unresolved conflicts', () => {
    const snapshot = validSnapshot()
    const modified = {
      ...snapshot,
      conflicts: [
        {
          type: 'sequence_conflict' as const,
          timelineEntryIds: [
            '00000000-0000-4000-8000-000000000701',
            '00000000-0000-4000-8000-000000000702',
          ] as const,
        },
      ],
    }

    const result = validateExportSnapshot(modified)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.reasons).toContainEqual({ code: 'unresolved_conflict', conflictIndex: 0 })
    }
  })

  it('blocks an unconfirmed timeline reference', () => {
    const snapshot = validSnapshot()
    const modified = {
      ...snapshot,
      confirmedTimeline: [{ ...confirmedTimeline[0]!, status: 'draft' as const }],
    }

    const result = validateExportSnapshot(modified)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.reasons).toContainEqual({
        code: 'timeline_unconfirmed',
        timelineEntryId: '00000000-0000-4000-8000-000000000701',
      })
    }
  })

  it('blocks missing evidence blobs and hash mismatches', () => {
    const missingSnapshot = validSnapshot()
    const missingResult = validateExportSnapshot({
      ...missingSnapshot,
      evidence: [{ metadata: evidenceFile, integrity: { status: 'missing' } }],
    })
    expect(missingResult.status).toBe('blocked')
    if (missingResult.status === 'blocked') {
      expect(missingResult.reasons).toContainEqual({
        code: 'evidence_missing',
        evidenceId,
      })
    }

    const mismatchSnapshot = validSnapshot()
    const mismatchResult = validateExportSnapshot({
      ...mismatchSnapshot,
      evidence: [
        {
          metadata: evidenceFile,
          integrity: { status: 'hash_mismatch', actualSha256: 'b'.repeat(64) },
        },
      ],
    })
    expect(mismatchResult.status).toBe('blocked')
    if (mismatchResult.status === 'blocked') {
      expect(mismatchResult.reasons).toContainEqual({
        code: 'evidence_hash_mismatch',
        evidenceId,
      })
    }
  })

  it('blocks missing OPFS capability when attachments exist', () => {
    const snapshot = validSnapshot()

    const result = validateExportSnapshot({ ...snapshot, opfsAvailable: false })
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.reasons).toContainEqual({ code: 'opfs_unavailable' })
    }
  })
})
