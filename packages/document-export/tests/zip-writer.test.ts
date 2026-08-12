import { createHash } from 'node:crypto'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildPackageDirectoryName, writeSubmissionPackage } from '../src/index.js'
import type { ExportSnapshot } from '../src/index.js'
import type { ZipChunkSink } from '../src/index.js'
import type {
  CaseEvent,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceFile,
  TimelineEntry,
} from '@youju/domain'

const caseId = '00000000-0000-4000-8000-000000000001'
const orderEvidenceId = '00000000-0000-4000-8000-000000000101'
const paymentEvidenceId = '00000000-0000-4000-8000-000000000102'
const orderBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04])
const paymentBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x05, 0x06])

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
}

function confirmedFact(
  id: string,
  fieldName: 'purchase_time' | 'merchant_name' | 'product_name' | 'paid_amount' | 'problem_description' | 'requested_resolution',
  value: string,
): ConfirmedFact {
  const base = {
    id,
    caseId,
    value,
    sourceRefs: [{ evidenceId: orderEvidenceId }],
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
  confirmedFact('00000000-0000-4000-8000-000000000601', 'purchase_time', '2026-07-01T12:16:00.000Z'),
  confirmedFact('00000000-0000-4000-8000-000000000602', 'merchant_name', '晴川生活示例店'),
  confirmedFact('00000000-0000-4000-8000-000000000603', 'product_name', '便携折叠桌'),
  confirmedFact('00000000-0000-4000-8000-000000000604', 'paid_amount', '89900'),
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

const statement: ConfirmedStatement = {
  id: '00000000-0000-4000-8000-000000000801',
  caseId,
  content: '事实陈述',
  confirmedFactIds: confirmedFacts.map((item) => item.id),
  confirmedTimelineEntryIds: confirmedTimeline.map((item) => item.id),
  ruleVersion: '1.0.0',
  confirmedAt: '2026-07-31T11:30:00.000Z',
  version: 1,
}

function evidenceFile(
  id: string,
  originalName: string,
  bytes: Uint8Array,
): EvidenceFile {
  return {
    id,
    caseId,
    originalName,
    mediaType: id === orderEvidenceId ? 'image/png' : 'application/pdf',
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    importedAt: '2026-07-31T11:05:00.000Z',
    sourceCreatedAt: null,
    category: id === orderEvidenceId ? 'order_record' : 'payment_record',
    storageRef: `cases/${caseId}/evidence/${id}`,
    isOriginalPreserved: true,
    metadata: {},
  }
}

const orderEvidence = evidenceFile(orderEvidenceId, 'order.png', orderBytes)
const paymentEvidence = evidenceFile(paymentEvidenceId, 'payment.pdf', paymentBytes)

function snapshot(): ExportSnapshot {
  return {
    caseEvent,
    confirmedFacts,
    confirmedTimeline,
    statement,
    ruleVersion: '1.0.0',
    findings: [],
    evidence: [
      { metadata: orderEvidence, integrity: { status: 'verified', actualSha256: orderEvidence.sha256 } },
      { metadata: paymentEvidence, integrity: { status: 'verified', actualSha256: paymentEvidence.sha256 } },
    ],
    conflicts: [],
    generatedAt: '2026-07-31T12:00:00.000Z',
    appVersion: '0.1.0',
    opfsAvailable: true,
  }
}

function collectSink(): {
  sink: ZipChunkSink
  state: { chunks: Uint8Array[]; closed: boolean; aborted: boolean }
} {
  const state = { chunks: [] as Uint8Array[], closed: false, aborted: false }
  const sink: ZipChunkSink = {
    write: async (chunk) => {
      state.chunks.push(chunk)
    },
    close: async () => {
      state.closed = true
    },
    abort: async () => {
      state.aborted = true
    },
  }
  return { sink, state }
}

describe('submission package ZIP writer', () => {
  it('writes the fixed package structure with verified attachments', async () => {
    const collected = collectSink()
    const directory = buildPackageDirectoryName('2026-07-31T12:00:00.000Z')
    expect(directory).toBe('有据_事件材料包_20260731_1200')

    await writeSubmissionPackage({
      snapshot: snapshot(),
      pdfs: {
        statement: new Uint8Array([1, 2, 3]),
        timeline: new Uint8Array([4, 5, 6]),
        evidenceList: new Uint8Array([7, 8, 9]),
      },
      openEvidence: async (evidence) => {
        if (evidence.id === orderEvidenceId) {
          return new Blob([orderBytes])
        }
        return new Blob([paymentBytes])
      },
      sink: collected.sink,
    })

    expect(collected.state.closed).toBe(true)
    expect(collected.state.aborted).toBe(false)

    const archive = unzipSync(Buffer.concat(collected.state.chunks))
    const entryNames = Object.keys(archive).sort()
    expect(entryNames).toEqual(
      [
        `${directory}/01_事件说明.pdf`,
        `${directory}/02_事件时间线.pdf`,
        `${directory}/03_证据材料清单.pdf`,
        `${directory}/04_材料摘要校验表.csv`,
        `${directory}/05_附件索引.html`,
        `${directory}/06_原始材料/001_order.png`,
        `${directory}/06_原始材料/002_payment.pdf`,
      ].sort(),
    )

    const orderEntry = archive[`${directory}/06_原始材料/001_order.png`]!
    const paymentEntry = archive[`${directory}/06_原始材料/002_payment.pdf`]!
    expect(new Uint8Array(orderEntry)).toEqual(orderBytes)
    expect(new Uint8Array(paymentEntry)).toEqual(paymentBytes)
    expect(createHash('sha256').update(orderEntry).digest('hex')).toBe(orderEvidence.sha256)
    expect(createHash('sha256').update(paymentEntry).digest('hex')).toBe(paymentEvidence.sha256)
  })

  it('aborts instead of closing when an attachment read fails', async () => {
    const collected = collectSink()

    await expect(
      writeSubmissionPackage({
        snapshot: snapshot(),
        pdfs: {
          statement: new Uint8Array([1]),
          timeline: new Uint8Array([2]),
          evidenceList: new Uint8Array([3]),
        },
        openEvidence: async (evidence) => {
          if (evidence.id === orderEvidenceId) {
            return new Blob([orderBytes])
          }
          throw new Error('read failed')
        },
        sink: collected.sink,
      }),
    ).rejects.toThrow('read failed')

    expect(collected.state.aborted).toBe(true)
    expect(collected.state.closed).toBe(false)
  })
})
