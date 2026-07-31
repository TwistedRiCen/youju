import { describe, expect, it, vi } from 'vitest'
import { deleteCasePermanently } from '../src/services/delete-case-service.js'
import { deleteEvidence, findEvidenceReferences } from '../src/services/reference-service.js'
import { recoverLocalOperations } from '../src/services/recover-local-operations.js'
import type { CaseRepository, StoredCase } from '../src/storage/index.js'
import type { EvidenceBlobStore, StagedEvidenceBlob } from '@youju/evidence-store'
import type {
  CaseEvent,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceFile,
  FactDraft,
  OperationJournalEntry,
  StatementDraft,
  TimelineEntry,
} from '@youju/domain'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const storageRef = `cases/${caseId}/evidence/${evidenceId}`

function evidenceFile(): EvidenceFile {
  return {
    id: evidenceId,
    caseId,
    originalName: 'order.png',
    mediaType: 'image/png',
    size: 16,
    sha256: 'a'.repeat(64),
    importedAt: '2026-07-31T12:00:00.000Z',
    sourceCreatedAt: null,
    category: 'order_record',
    storageRef,
    isOriginalPreserved: true,
    metadata: {},
  }
}

function confirmedFact(id: string, referencesEvidence: boolean): ConfirmedFact {
  return {
    id,
    caseId,
    factType: 'merchant',
    fieldName: 'merchant_name',
    value: '示例店',
    sourceRefs: referencesEvidence ? [{ evidenceId }] : [],
    confirmedAt: '2026-07-31T12:10:00.000Z',
    confirmationMethod: 'manual',
    derivedFromCandidateId: null,
    replacesFactId: null,
    version: 1,
  }
}

function timelineEntry(id: string, referencesEvidence: boolean): TimelineEntry {
  return {
    id,
    caseId,
    occurredAt: '2026-07-01T12:16:00.000Z',
    timePrecision: 'minute',
    summary: '下单',
    detail: null,
    sourceRefs: referencesEvidence ? [{ evidenceId }] : [],
    status: 'confirmed',
    sortOrder: 0,
  }
}

class FakeRepository {
  readonly calls = {
    putOperation: vi.fn(),
    deleteOperation: vi.fn(),
    removeEvidence: vi.fn(),
    deleteAllCaseRecords: vi.fn(),
    delete: vi.fn(),
  }

  operations: OperationJournalEntry[] = []
  evidence: EvidenceFile[] = []
  facts: ConfirmedFact[] = []
  timeline: TimelineEntry[] = []
  drafts: FactDraft[] = []
  statements: ConfirmedStatement[] = []
  statementDrafts: StatementDraft[] = []
  caseEvent: CaseEvent | null = null

  async listOperations(): Promise<readonly OperationJournalEntry[]> {
    return [...this.operations]
  }
  async putOperation(entry: OperationJournalEntry): Promise<void> {
    this.calls.putOperation(entry)
    const index = this.operations.findIndex((item) => item.operationId === entry.operationId)
    if (index === -1) {
      this.operations.push(entry)
    } else {
      this.operations[index] = entry
    }
  }
  async deleteOperation(operationId: string): Promise<void> {
    this.calls.deleteOperation(operationId)
    this.operations = this.operations.filter((item) => item.operationId !== operationId)
  }
  async listEvidence(): Promise<readonly EvidenceFile[]> {
    return [...this.evidence]
  }
  async listConfirmedFacts(): Promise<readonly ConfirmedFact[]> {
    return [...this.facts]
  }
  async listTimeline(): Promise<readonly TimelineEntry[]> {
    return [...this.timeline]
  }
  async listStatementDrafts(): Promise<readonly StatementDraft[]> {
    return [...this.statementDrafts]
  }
  async listConfirmedStatements(): Promise<readonly ConfirmedStatement[]> {
    return [...this.statements]
  }
  async removeEvidence(evidenceId: string): Promise<void> {
    this.calls.removeEvidence(evidenceId)
    this.evidence = this.evidence.filter((item) => item.id !== evidenceId)
  }
  async deleteAllCaseRecords(): Promise<void> {
    this.calls.deleteAllCaseRecords()
    this.evidence = []
    this.facts = []
    this.timeline = []
    this.drafts = []
    this.statements = []
    this.statementDrafts = []
    this.caseEvent = null
  }
  async getCase(): Promise<null> {
    return null
  }
  async listCaseStorageRefs(): Promise<readonly string[]> {
    return []
  }
  async createCase(): Promise<StoredCase> {
    throw new Error('not implemented')
  }
  async updateCase(): Promise<StoredCase> {
    throw new Error('not implemented')
  }
  async replaceFactDrafts(): Promise<number> {
    throw new Error('not implemented')
  }
  async findEvidenceByHash(): Promise<null> {
    return null
  }
  async addReadyEvidence(): Promise<void> {}
  async confirmFact(): Promise<ConfirmedFact> {
    throw new Error('not implemented')
  }
  async putTimelineDraft(): Promise<void> {}
  async confirmTimelineEntry(): Promise<TimelineEntry> {
    throw new Error('not implemented')
  }
  async reorderTimeline(): Promise<void> {}
  async putStatementDraft(): Promise<void> {}
  async appendConfirmedStatement(): Promise<void> {}
  async updateEvidenceCategory(): Promise<EvidenceFile> {
    throw new Error('not implemented')
  }
  close(): void {}
}

class FakeBlobStore {
  failDeleteOnce = false
  readonly blobs = new Map<string, Uint8Array>()
  readonly calls = { delete: vi.fn(), deleteTemporary: vi.fn(), exists: vi.fn() }

  async stage(): Promise<StagedEvidenceBlob> {
    throw new Error('not implemented')
  }
  async commit(): Promise<string> {
    throw new Error('not implemented')
  }
  async read(): Promise<Blob> {
    throw new Error('not implemented')
  }
  async exists(storageRef: string): Promise<boolean> {
    this.calls.exists(storageRef)
    return this.blobs.has(storageRef)
  }
  async delete(storageRef: string): Promise<void> {
    this.calls.delete(storageRef)
    if (this.failDeleteOnce) {
      this.failDeleteOnce = false
      throw new Error('opfs failure')
    }
    this.blobs.delete(storageRef)
  }
  async deleteTemporary(operationId: string): Promise<void> {
    this.calls.deleteTemporary(operationId)
  }
  async listCaseStorageRefs(): Promise<readonly string[]> {
    return []
  }
  async deleteCase(): Promise<void> {}
}

describe('evidence reference protection', () => {
  it('finds fact and timeline references for an evidence id', async () => {
    const repository = new FakeRepository()
    repository.facts = [confirmedFact('00000000-0000-4000-8000-000000000601', true)]
    repository.timeline = [timelineEntry('00000000-0000-4000-8000-000000000701', true)]

    const references = await findEvidenceReferences(caseId, evidenceId, repository as unknown as CaseRepository)

    expect(references).toEqual([
      { type: 'confirmed_fact', id: '00000000-0000-4000-8000-000000000601' },
      { type: 'timeline_entry', id: '00000000-0000-4000-8000-000000000701' },
    ])
  })

  it('blocks deleting referenced evidence with its references', async () => {
    const repository = new FakeRepository()
    repository.evidence = [evidenceFile()]
    repository.facts = [confirmedFact('00000000-0000-4000-8000-000000000601', true)]
    const blobStore = new FakeBlobStore()
    blobStore.blobs.set(storageRef, new Uint8Array([1]))

    await expect(
      deleteEvidence(caseId, evidenceId, repository as unknown as CaseRepository, blobStore as unknown as EvidenceBlobStore),
    ).rejects.toMatchObject({
      code: 'evidence_is_referenced',
      references: [{ type: 'confirmed_fact', id: '00000000-0000-4000-8000-000000000601' }],
    })
    expect(repository.calls.putOperation).not.toHaveBeenCalled()
  })

  it('recovers an evidence_delete journal after a one-time OPFS failure', async () => {
    const repository = new FakeRepository()
    repository.evidence = [evidenceFile()]
    const blobStore = new FakeBlobStore()
    blobStore.blobs.set(storageRef, new Uint8Array([1]))
    blobStore.failDeleteOnce = true

    await expect(
      deleteEvidence(caseId, evidenceId, repository as unknown as CaseRepository, blobStore as unknown as EvidenceBlobStore),
    ).rejects.toThrow('opfs failure')

    const journal = repository.operations.filter(
      (entry) => entry.operationType === 'evidence_delete',
    )
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ stage: 'deleting', evidenceId })

    await recoverLocalOperations({
      repository: repository as unknown as CaseRepository,
      blobStore: blobStore as unknown as EvidenceBlobStore,
    })

    expect(repository.calls.removeEvidence).toHaveBeenCalledWith(evidenceId)
    expect(repository.calls.deleteOperation).toHaveBeenCalledWith(journal[0]!.operationId)
    expect(repository.evidence).toHaveLength(0)
    expect(blobStore.blobs.has(storageRef)).toBe(false)
  })
})

describe('verified whole-case deletion', () => {
  it('fails once with opfs remaining, then completes idempotently', async () => {
    const repository = new FakeRepository()
    repository.evidence = [evidenceFile()]
    const blobStore = new FakeBlobStore()
    blobStore.blobs.set(storageRef, new Uint8Array([1]))
    blobStore.failDeleteOnce = true
    const dependencies = {
      repository: repository as unknown as CaseRepository,
      blobStore: blobStore as unknown as EvidenceBlobStore,
    }

    const first = await deleteCasePermanently(
      {
        caseId,
        operationId: '00000000-0000-4000-8000-000000000901',
        expectedTitle: '运输破损退款纠纷',
        enteredTitle: '运输破损退款纠纷',
        startedAt: '2026-07-31T13:00:00.000Z',
      },
      dependencies,
    )

    expect(first).toEqual({
      status: 'failed',
      code: 'delete_verification_failed',
      remaining: ['opfs'],
    })
    const journal = repository.operations.filter(
      (entry) => entry.operationType === 'case_delete',
    )
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ stage: 'deleting' })

    const second = await deleteCasePermanently(
      {
        caseId,
        operationId: '00000000-0000-4000-8000-000000000901',
        expectedTitle: '运输破损退款纠纷',
        enteredTitle: '运输破损退款纠纷',
        startedAt: '2026-07-31T13:01:00.000Z',
      },
      dependencies,
    )

    expect(second).toEqual({ status: 'deleted' })
    expect(repository.operations).toEqual([])
    expect(repository.calls.deleteAllCaseRecords).toHaveBeenCalled()
    expect(blobStore.blobs.size).toBe(0)
  })
})
