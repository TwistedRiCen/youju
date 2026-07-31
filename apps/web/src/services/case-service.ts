import type { CaseEvent, FactDraft, UuidV4 } from '@youju/domain'
import {
  DATABASE_MIGRATIONS,
  IndexedDbCaseRepository,
  openYoujuDatabase,
} from '../storage/index.js'
import type { CaseAggregate, CaseRepository, StoredCase } from '../storage/index.js'

export interface CreateCaseFormValue {
  readonly title: string
  readonly purchaseTime: string
  readonly merchantName: string
  readonly productName: string
  readonly paidAmountYuan: string
  readonly requestedResolution: string
}

const WRITER_ID = 'local-session'

let repositoryPromise: Promise<CaseRepository> | null = null

export function getCaseRepository(): Promise<CaseRepository> {
  if (repositoryPromise === null) {
    repositoryPromise = openYoujuDatabase(DATABASE_MIGRATIONS).then(
      (database) => new IndexedDbCaseRepository(database),
    )
  }
  return repositoryPromise
}

export function yuanToFen(value: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (match === null) {
    return null
  }
  const yuan = match[1] ?? ''
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const fen = `${yuan}${fraction}`.replace(/^0+(?=\d)/, '')
  return fen === '' ? '0' : fen
}

export function fenToYuan(value: string): string {
  const padded = value.padStart(3, '0')
  const yuan = padded.slice(0, -2).replace(/^0+(?=\d)/, '')
  return `${yuan === '' ? '0' : yuan}.${padded.slice(-2)}`
}

export function toUtcTimestamp(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString()
}

export async function createLocalCase(
  repository: CaseRepository,
  value: CreateCaseFormValue,
): Promise<StoredCase> {
  const paidAmountFen = yuanToFen(value.paidAmountYuan)
  if (paidAmountFen === null) {
    throw new Error('invalid_paid_amount')
  }

  const now = new Date().toISOString()
  const caseId = crypto.randomUUID()
  const caseEvent: CaseEvent = {
    id: caseId,
    scenarioType: 'ecommerce_refund',
    title: value.title,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    requestedResolution: value.requestedResolution,
    storageMode: 'local',
    schemaVersion: 1,
  }
  const drafts: FactDraft[] = [
    {
      id: crypto.randomUUID(),
      caseId,
      factType: 'order',
      fieldName: 'purchase_time',
      value: toUtcTimestamp(value.purchaseTime),
      sourceRefs: [],
      updatedAt: now,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      factType: 'merchant',
      fieldName: 'merchant_name',
      value: value.merchantName,
      sourceRefs: [],
      updatedAt: now,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      factType: 'product',
      fieldName: 'product_name',
      value: value.productName,
      sourceRefs: [],
      updatedAt: now,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      factType: 'payment',
      fieldName: 'paid_amount',
      value: paidAmountFen,
      sourceRefs: [],
      updatedAt: now,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      caseId,
      factType: 'resolution',
      fieldName: 'requested_resolution',
      value: value.requestedResolution,
      sourceRefs: [],
      updatedAt: now,
      revision: 1,
    },
  ]

  return repository.createCase(caseEvent, drafts, WRITER_ID)
}

export async function loadCase(
  repository: CaseRepository,
  caseId: UuidV4,
): Promise<CaseAggregate | null> {
  return repository.getCase(caseId)
}

export async function saveCaseDrafts(
  repository: CaseRepository,
  caseId: UuidV4,
  expectedRevision: number,
  drafts: readonly FactDraft[],
): Promise<number> {
  return repository.replaceFactDrafts(caseId, expectedRevision, drafts, WRITER_ID)
}
