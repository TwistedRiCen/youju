import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import type {
  CaseEvent,
  ConfirmFactCommand,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceFile,
  FactDraft,
  OperationJournalEntry,
  StatementDraft,
  TimelineEntry,
} from '@youju/domain'
import type { EvidenceBlobStore, StagedEvidenceBlob } from '@youju/evidence-store'
import { EvidenceBlobStoreError } from '@youju/evidence-store'
import type { CaseRepository, StoredCase } from '../src/storage/index.js'
import { recoverLocalOperations } from '../src/services/recover-local-operations.js'
import {
  findDemoCase,
  loadDemoCase,
  resetDemoCase,
  type DemoCaseServiceDependencies,
} from '../src/demo/index.js'
import manifestJson from '../public/demo/m4-ecommerce-refund-demo-v1/manifest.json'

const FIXTURE_ID = 'm4-ecommerce-refund-demo-v1'
const publicDemoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'demo',
  FIXTURE_ID,
)

class MemoryRepository {
  cases: StoredCase[] = []
  drafts: FactDraft[] = []
  evidence: EvidenceFile[] = []
  facts: ConfirmedFact[] = []
  timeline: TimelineEntry[] = []
  statements: ConfirmedStatement[] = []
  operations: OperationJournalEntry[] = []
  leaveCaseOnDelete = false
  corruptEvidenceOnWrite = false
  readonly calls = { createCase: vi.fn(), deleteAllCaseRecords: vi.fn() }

  async createCase(caseEvent: CaseEvent, drafts: readonly FactDraft[], writerId: string) {
    this.calls.createCase(caseEvent, drafts, writerId)
    const stored = { caseEvent, revision: 1, lastWriterId: writerId }
    this.cases.push(stored)
    this.drafts.push(...drafts)
    return stored
  }
  async listCases() { return [...this.cases] }
  async getCase(caseId: string) {
    const stored = this.cases.find(({ caseEvent }) => caseEvent.id === caseId)
    return stored === undefined
      ? null
      : { ...stored, factDrafts: this.drafts.filter((draft) => draft.caseId === caseId) }
  }
  async updateCase(command: {
    caseId: string
    expectedRevision: number
    patch: Partial<CaseEvent>
    updatedAt: string
    writerId: string
  }) {
    const index = this.cases.findIndex(({ caseEvent }) => caseEvent.id === command.caseId)
    const stored = this.cases[index]
    if (stored === undefined || stored.revision !== command.expectedRevision) throw new Error('conflict')
    const updated = {
      caseEvent: { ...stored.caseEvent, ...command.patch, updatedAt: command.updatedAt } as CaseEvent,
      revision: stored.revision + 1,
      lastWriterId: command.writerId,
    }
    this.cases[index] = updated
    return updated
  }
  async listEvidence(caseId: string) { return this.evidence.filter((item) => item.caseId === caseId) }
  async addReadyEvidence(evidence: EvidenceFile) {
    this.evidence.push(this.corruptEvidenceOnWrite ? { ...evidence, originalName: 'corrupt.bin' } : evidence)
  }
  async listConfirmedFacts(caseId: string) { return this.facts.filter((item) => item.caseId === caseId) }
  async confirmFact(command: ConfirmFactCommand) {
    const draft = this.drafts.find(({ id }) => id === command.draftId)
    if (draft === undefined) throw new Error('missing draft')
    const fact = {
      ...draft,
      id: command.confirmedFactId,
      confirmedAt: command.confirmedAt,
      confirmationMethod: 'manual' as const,
      derivedFromCandidateId: null,
      replacesFactId: command.replacesFactId,
      version: 1,
      sourceRefs: [...command.sourceRefs],
    } as unknown as ConfirmedFact
    this.facts.push(fact)
    return fact
  }
  async putTimelineDraft(entry: TimelineEntry) { this.timeline.push(entry) }
  async confirmTimelineEntry(id: string) {
    const index = this.timeline.findIndex((entry) => entry.id === id)
    const entry = this.timeline[index]
    if (entry === undefined) throw new Error('missing timeline')
    const confirmed = { ...entry, status: 'confirmed' as const }
    this.timeline[index] = confirmed
    return confirmed
  }
  async listTimeline(caseId: string) { return this.timeline.filter((item) => item.caseId === caseId) }
  async appendConfirmedStatement(statement: ConfirmedStatement) { this.statements.push(statement) }
  async listConfirmedStatements(caseId: string) { return this.statements.filter((item) => item.caseId === caseId) }
  async listStatementDrafts(): Promise<readonly StatementDraft[]> { return [] }
  async listAnalyses() { return [] }
  async listCandidates() { return [] }
  async putOperation(entry: OperationJournalEntry) {
    const index = this.operations.findIndex(({ operationId }) => operationId === entry.operationId)
    if (index === -1) this.operations.push(entry)
    else this.operations[index] = entry
  }
  async listOperations() { return [...this.operations] }
  async deleteOperation(operationId: string) {
    this.operations = this.operations.filter((entry) => entry.operationId !== operationId)
  }
  async deleteAllCaseRecords(caseId: string) {
    this.calls.deleteAllCaseRecords(caseId)
    if (this.leaveCaseOnDelete) return
    this.cases = this.cases.filter(({ caseEvent }) => caseEvent.id !== caseId)
    this.drafts = this.drafts.filter((item) => item.caseId !== caseId)
    this.evidence = this.evidence.filter((item) => item.caseId !== caseId)
    this.facts = this.facts.filter((item) => item.caseId !== caseId)
    this.timeline = this.timeline.filter((item) => item.caseId !== caseId)
    this.statements = this.statements.filter((item) => item.caseId !== caseId)
  }
}

class MemoryBlobStore {
  readonly temporary = new Map<string, Uint8Array>()
  readonly blobs = new Map<string, Uint8Array>()
  failStage = false
  leaveCaseOnDelete = false

  async stage(operationId: string, chunks: AsyncIterable<Uint8Array>): Promise<StagedEvidenceBlob> {
    if (this.failStage) throw new EvidenceBlobStoreError('not_allowed', 'unavailable')
    const collected: number[] = []
    for await (const chunk of chunks) collected.push(...chunk)
    const bytes = new Uint8Array(collected)
    this.temporary.set(operationId, bytes)
    return { operationId, temporaryStorageRef: `temporary/${operationId}`, size: bytes.length }
  }
  async commit(staged: StagedEvidenceBlob, caseId: string, evidenceId: string) {
    const bytes = this.temporary.get(staged.operationId)
    if (bytes === undefined) throw new Error('missing temporary')
    const path = `cases/${caseId}/evidence/${evidenceId}`
    this.blobs.set(path, bytes)
    this.temporary.delete(staged.operationId)
    return path
  }
  async read(path: string) {
    const bytes = this.blobs.get(path)
    if (bytes === undefined) throw new Error('missing blob')
    return new Blob([bytes.slice().buffer])
  }
  async exists(path: string) { return this.blobs.has(path) || this.temporary.has(path.replace('temporary/', '')) }
  async delete(path: string) { this.blobs.delete(path) }
  async deleteTemporary(operationId: string) { this.temporary.delete(operationId) }
  async listCaseStorageRefs(caseId: string) {
    return [...this.blobs.keys()].filter((path) => path.startsWith(`cases/${caseId}/`)).sort()
  }
  async deleteCase(caseId: string) {
    if (this.leaveCaseOnDelete) return
    for (const path of await this.listCaseStorageRefs(caseId)) this.blobs.delete(path)
  }
}

const createDependencies = (
  repository = new MemoryRepository(),
  blobStore = new MemoryBlobStore(),
): DemoCaseServiceDependencies => ({
  repository: repository as unknown as CaseRepository,
  blobStore: blobStore as unknown as EvidenceBlobStore,
  loadManifest: async () => manifestJson,
  readAsset: async (_fixtureId, relativePath) =>
    new Uint8Array(await readFile(join(publicDemoRoot, relativePath))),
  estimateStorage: async () => ({ quota: 10_000_000, usage: 0 }),
  now: () => '2026-08-18T00:00:00.000Z',
  uuid: () => crypto.randomUUID(),
})

describe('demo case loading', () => {
  it('loads once with fresh UUIDs, rewritten references, verified blobs, and no AI records', async () => {
    const repository = new MemoryRepository()
    const blobStore = new MemoryBlobStore()
    const dependencies = createDependencies(repository, blobStore)
    await expect(dependencies.readAsset(FIXTURE_ID, 'binary/01-order-record.png')).resolves.toHaveLength(129)

    const first = await loadDemoCase(FIXTURE_ID, dependencies)
    const second = await loadDemoCase(FIXTURE_ID, dependencies)

    expect(first.status).toBe('loaded')
    expect(second).toEqual({ status: 'existing', caseId: first.caseId })
    expect(repository.calls.createCase).toHaveBeenCalledOnce()
    expect(repository.cases[0]?.caseEvent).toMatchObject({
      dataOrigin: 'fictional_demo',
      demoFixtureId: FIXTURE_ID,
    })
    const persistedIds = [
      first.caseId,
      ...repository.evidence.map(({ id }) => id),
      ...repository.facts.map(({ id }) => id),
      ...repository.timeline.map(({ id }) => id),
      ...repository.statements.map(({ id }) => id),
    ]
    expect(persistedIds).toHaveLength(new Set(persistedIds).size)
    expect(persistedIds.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true)
    const evidenceIds = new Set(repository.evidence.map(({ id }) => id))
    expect(repository.facts.flatMap(({ sourceRefs }) => sourceRefs).every(({ evidenceId }) => evidenceIds.has(evidenceId))).toBe(true)
    expect(repository.timeline.flatMap(({ sourceRefs }) => sourceRefs).every(({ evidenceId }) => evidenceIds.has(evidenceId))).toBe(true)
    expect(repository.operations).toEqual([])
    expect(blobStore.temporary.size).toBe(0)
    expect(blobStore.blobs.size).toBe(4)
  })

  it('rejects insufficient quota before creating records or staging blobs', async () => {
    const repository = new MemoryRepository()
    const blobStore = new MemoryBlobStore()
    const dependencies = { ...createDependencies(repository, blobStore), estimateStorage: async () => ({ quota: 10, usage: 9 }) }

    await expect(loadDemoCase(FIXTURE_ID, dependencies)).rejects.toMatchObject({
      code: 'storage_quota_exceeded',
    })
    expect(repository.calls.createCase).not.toHaveBeenCalled()
    expect(blobStore.blobs.size).toBe(0)
  })

  it('serializes concurrent loads into one persisted demo case', async () => {
    const repository = new MemoryRepository()
    const dependencies = createDependencies(repository, new MemoryBlobStore())

    const results = await Promise.all([
      loadDemoCase(FIXTURE_ID, dependencies),
      loadDemoCase(FIXTURE_ID, dependencies),
    ])

    expect(results.map(({ status }) => status).sort()).toEqual(['existing', 'loaded'])
    expect(new Set(results.map(({ caseId }) => caseId)).size).toBe(1)
    expect(repository.calls.createCase).toHaveBeenCalledOnce()
  })

  it('records an OPFS failure for recovery without reporting success', async () => {
    const repository = new MemoryRepository()
    const blobStore = new MemoryBlobStore()
    blobStore.failStage = true

    await expect(loadDemoCase(FIXTURE_ID, createDependencies(repository, blobStore))).rejects.toMatchObject({
      code: 'storage_not_supported',
    })
    expect(repository.operations).toHaveLength(1)
    expect(repository.operations[0]).toMatchObject({
      operationType: 'demo_case_load',
      stage: 'failed',
      errorCode: 'storage_not_supported',
    })

    await recoverLocalOperations({
      repository: repository as unknown as CaseRepository,
      blobStore: blobStore as unknown as EvidenceBlobStore,
    })
    expect(repository.operations).toEqual([])
    blobStore.failStage = false
    await expect(loadDemoCase(FIXTURE_ID, createDependencies(repository, blobStore))).resolves.toMatchObject({
      status: 'loaded',
    })
  })

  it('does not report success when structured readback differs from the manifest', async () => {
    const repository = new MemoryRepository()
    repository.corruptEvidenceOnWrite = true

    await expect(
      loadDemoCase(FIXTURE_ID, createDependencies(repository, new MemoryBlobStore())),
    ).rejects.toMatchObject({ code: 'demo_verification_failed' })
    expect(repository.operations[0]).toMatchObject({
      operationType: 'demo_case_load',
      stage: 'failed',
    })
  })

  it('refuses an ambiguous duplicate demo identity', async () => {
    const repository = new MemoryRepository()
    const base = manifestJson.case
    for (let index = 0; index < 2; index += 1) {
      await repository.createCase(
        { ...base, id: crypto.randomUUID() } as CaseEvent,
        [],
        'test',
      )
    }

    await expect(
      findDemoCase(FIXTURE_ID, repository as unknown as CaseRepository),
    ).rejects.toMatchObject({ code: 'demo_case_ambiguous' })
  })

  it('resets only the matching demo and preserves a user-created case', async () => {
    const repository = new MemoryRepository()
    const blobStore = new MemoryBlobStore()
    const dependencies = createDependencies(repository, blobStore)
    const userCase: CaseEvent = {
      id: crypto.randomUUID(), scenarioType: 'ecommerce_refund', title: '用户事件',
      createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
      status: 'draft', requestedResolution: null, storageMode: 'local', schemaVersion: 2,
      dataOrigin: 'user_created', demoFixtureId: null,
    }
    await repository.createCase(userCase, [], 'test')
    const loaded = await loadDemoCase(FIXTURE_ID, dependencies)

    const reset = await resetDemoCase(FIXTURE_ID, dependencies)

    expect(reset.status).toBe('loaded')
    expect(reset.caseId).not.toBe(loaded.caseId)
    expect(await repository.getCase(userCase.id)).not.toBeNull()
    expect(await repository.getCase(loaded.caseId)).toBeNull()
    expect(await blobStore.listCaseStorageRefs(loaded.caseId)).toEqual([])
    await expect(findDemoCase(FIXTURE_ID, repository as unknown as CaseRepository)).resolves.toMatchObject({
      caseEvent: { id: reset.caseId },
    })
  })

  it('recovers partial demo loads without deleting a user-created case referenced by a journal', async () => {
    const repository = new MemoryRepository()
    const blobStore = new MemoryBlobStore()
    const dependencies = createDependencies(repository, blobStore)
    const userCase: CaseEvent = {
      id: crypto.randomUUID(), scenarioType: 'ecommerce_refund', title: '用户事件',
      createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
      status: 'draft', requestedResolution: null, storageMode: 'local', schemaVersion: 2,
      dataOrigin: 'user_created', demoFixtureId: null,
    }
    await repository.createCase(userCase, [], 'test')
    await repository.putOperation({
      operationId: crypto.randomUUID(), caseId: userCase.id, operationType: 'demo_case_load',
      stage: 'failed', demoFixtureId: FIXTURE_ID, startedAt: '2026-08-18T00:00:00.000Z', errorCode: null,
    })

    await recoverLocalOperations(dependencies)

    expect(await repository.getCase(userCase.id)).not.toBeNull()
    expect(repository.calls.deleteAllCaseRecords).not.toHaveBeenCalled()
    expect(repository.operations).toEqual([])
  })

  it.each(['validating', 'writing', 'verifying', 'failed'] as const)(
    'removes a partial fictional demo interrupted at %s',
    async (stage) => {
      const repository = new MemoryRepository()
      const blobStore = new MemoryBlobStore()
      const caseId = crypto.randomUUID()
      const operationId = crypto.randomUUID()
      await repository.createCase({ ...manifestJson.case, id: caseId } as CaseEvent, [], 'test')
      blobStore.blobs.set(`cases/${caseId}/evidence/${crypto.randomUUID()}`, new Uint8Array([1]))
      await repository.putOperation({
        operationId, caseId, operationType: 'demo_case_load', stage,
        demoFixtureId: FIXTURE_ID, startedAt: '2026-08-18T00:00:00.000Z', errorCode: null,
      })

      await recoverLocalOperations({
        repository: repository as unknown as CaseRepository,
        blobStore: blobStore as unknown as EvidenceBlobStore,
      })

      expect(await repository.getCase(caseId)).toBeNull()
      expect(await blobStore.listCaseStorageRefs(caseId)).toEqual([])
      expect(repository.operations).toEqual([])
    },
  )

  it('stops recovery when partial demo records or blobs cannot be removed', async () => {
    const repository = new MemoryRepository()
    const blobStore = new MemoryBlobStore()
    repository.leaveCaseOnDelete = true
    blobStore.leaveCaseOnDelete = true
    const caseId = crypto.randomUUID()
    const operationId = crypto.randomUUID()
    await repository.createCase({ ...manifestJson.case, id: caseId } as CaseEvent, [], 'test')
    blobStore.blobs.set(`cases/${caseId}/evidence/${crypto.randomUUID()}`, new Uint8Array([1]))
    await repository.putOperation({
      operationId, caseId, operationType: 'demo_case_load', stage: 'failed',
      demoFixtureId: FIXTURE_ID, startedAt: '2026-08-18T00:00:00.000Z', errorCode: null,
    })

    await expect(recoverLocalOperations({
      repository: repository as unknown as CaseRepository,
      blobStore: blobStore as unknown as EvidenceBlobStore,
    })).rejects.toThrow('demo_recovery_incomplete')
    expect(await repository.getCase(caseId)).not.toBeNull()
    expect(repository.operations).toHaveLength(1)
  })
})
