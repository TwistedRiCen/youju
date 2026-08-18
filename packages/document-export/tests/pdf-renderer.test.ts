import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { renderSubmissionPdfs } from '../src/index.js'
import type { ExportSnapshot } from '../src/index.js'
import type {
  CaseEvent,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceFile,
  TimelineEntry,
} from '@youju/domain'
import type { RuleFinding } from '@youju/rule-engine'

const fontBytes = await readFile(
  new URL('../../../apps/web/src/assets/fonts/NotoSansCJKsc-Regular.otf', import.meta.url),
)

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'

const caseEvent: CaseEvent = {
  id: caseId,
  scenarioType: 'ecommerce_refund',
  title: '运输破损退款纠纷',
  createdAt: '2026-07-31T11:00:00.000Z',
  updatedAt: '2026-07-31T11:00:00.000Z',
  status: 'in_progress',
  requestedResolution: '退货退款',
  storageMode: 'local',
  schemaVersion: 1,
  dataOrigin: 'user_created',
  demoFixtureId: null,
}

function fact(
  id: string,
  fieldName:
    | 'purchase_time'
    | 'merchant_name'
    | 'product_name'
    | 'paid_amount'
    | 'problem_description'
    | 'requested_resolution',
  value: string,
): ConfirmedFact {
  const base = {
    id,
    caseId,
    value,
    sourceRefs: [{ evidenceId }],
    confirmedAt: '2026-07-31T11:10:00.000Z',
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
  fact('00000000-0000-4000-8000-000000000601', 'purchase_time', '2026-07-01T12:16:00.000Z'),
  fact('00000000-0000-4000-8000-000000000602', 'merchant_name', '晴川生活示例店'),
  fact('00000000-0000-4000-8000-000000000603', 'product_name', '便携折叠桌'),
  fact('00000000-0000-4000-8000-000000000604', 'paid_amount', '89900'),
  fact('00000000-0000-4000-8000-000000000605', 'problem_description', '包裹破损'),
  fact('00000000-0000-4000-8000-000000000606', 'requested_resolution', '退货退款'),
]

const confirmedTimeline: readonly TimelineEntry[] = [
  {
    id: '00000000-0000-4000-8000-000000000701',
    caseId,
    occurredAt: '2026-07-01T12:16:00.000Z',
    timePrecision: 'minute',
    summary: '下单',
    detail: null,
    sourceRefs: [{ evidenceId }],
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
    status: 'confirmed',
    sortOrder: 0,
  },
]

const statement: ConfirmedStatement = {
  id: '00000000-0000-4000-8000-000000000801',
  caseId,
  content: `我在晴川生活示例店购买了便携折叠桌。\n${'该商品在运输过程中出现破损，外箱凹陷且桌板边角开裂，商家拒绝退款。'.repeat(
    120,
  )}`,
  confirmedFactIds: confirmedFacts.map((item) => item.id),
  confirmedTimelineEntryIds: confirmedTimeline.map((item) => item.id),
  contentOrigin: 'manual',
  derivedFromCandidateId: null,
  ruleVersion: '1.0.0',
  confirmedAt: '2026-07-31T11:30:00.000Z',
  version: 1,
}

const evidenceFile: EvidenceFile = {
  id: evidenceId,
  caseId,
  originalName: '订单.png',
  mediaType: 'image/png',
  size: 16,
  sha256: 'a'.repeat(64),
  importedAt: '2026-07-31T11:05:00.000Z',
  sourceCreatedAt: null,
  category: 'order_record',
  categoryOrigin: 'manual',
  categoryCandidateId: null,
  storageRef: `cases/${caseId}/evidence/${evidenceId}`,
  isOriginalPreserved: true,
  metadata: {},
}

const finding: RuleFinding = {
  ruleId: 'consumer.ecommerce.refund.basic',
  ruleVersion: '1.0.0',
  severity: 'warning',
  resultType: 'missing_evidence',
  message: '建议补充：商家沟通记录',
  relatedEvidenceIds: [],
  sourceReference: 'stable-method:merchant-communication',
}

function snapshot(): ExportSnapshot {
  return {
    caseEvent,
    confirmedFacts,
    confirmedTimeline,
    statement,
    ruleVersion: '1.0.0',
    findings: [finding],
    evidence: [{ metadata: evidenceFile, integrity: { status: 'verified', actualSha256: 'a'.repeat(64) } }],
    conflicts: [],
    generatedAt: '2026-07-31T12:00:00.000Z',
    appVersion: '0.1.0',
    opfsAvailable: true,
  }
}

describe('submission PDF rendering', () => {
  it('produces three loadable PDFs with titles and a paginated statement', async () => {
    const pdfs = await renderSubmissionPdfs(snapshot(), new Uint8Array(fontBytes))

    const statementDoc = await PDFDocument.load(pdfs.statement)
    const timelineDoc = await PDFDocument.load(pdfs.timeline)
    const evidenceDoc = await PDFDocument.load(pdfs.evidenceList)

    expect(statementDoc.getTitle()).toBe('有据事件说明')
    expect(timelineDoc.getTitle()).toBe('有据事件时间线')
    expect(evidenceDoc.getTitle()).toBe('有据证据材料清单')
    expect(statementDoc.getPageCount()).toBeGreaterThanOrEqual(3)
    expect(timelineDoc.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(evidenceDoc.getPageCount()).toBeGreaterThanOrEqual(1)
  })

  it('renders deterministically for a fixed generatedAt', async () => {
    const font = new Uint8Array(fontBytes)
    const first = await renderSubmissionPdfs(snapshot(), font)
    const second = await renderSubmissionPdfs(snapshot(), font)

    expect(second.statement).toEqual(first.statement)
    expect(second.timeline).toEqual(first.timeline)
    expect(second.evidenceList).toEqual(first.evidenceList)
  })
})
