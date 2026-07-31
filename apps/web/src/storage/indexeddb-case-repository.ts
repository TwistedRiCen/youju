import type { IDBPDatabase } from 'idb'
import type {
  CaseEvent,
  ConfirmFactCommand,
  ConfirmedFact,
  EvidenceCategory,
  EvidenceFile,
  FactDraft,
  OperationJournalEntry,
  UuidV4,
} from '@youju/domain'
import { buildManualConfirmedFact } from '@youju/domain'
import { CaseRepositoryError } from './case-repository.js'
import type {
  CaseAggregate,
  CaseRepository,
  StoredCase,
  UpdateCaseCommand,
} from './case-repository.js'
import type { PersistedCaseEvent, YouJuDatabaseSchema } from './database-schema.js'

function toCaseEvent(record: PersistedCaseEvent): CaseEvent {
  return {
    id: record.id,
    scenarioType: record.scenarioType,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status,
    requestedResolution: record.requestedResolution,
    storageMode: record.storageMode,
    schemaVersion: record.schemaVersion,
  }
}

function toStoredCase(record: PersistedCaseEvent): StoredCase {
  return {
    caseEvent: toCaseEvent(record),
    revision: record.revision,
    lastWriterId: record.lastWriterId,
  }
}

function toStorageError(error: unknown): CaseRepositoryError {
  if (error instanceof CaseRepositoryError) {
    return error
  }
  return new CaseRepositoryError('storage_unavailable', '本地存储不可用')
}

export class IndexedDbCaseRepository implements CaseRepository {
  constructor(private readonly database: IDBPDatabase<YouJuDatabaseSchema>) {}

  async createCase(
    caseEvent: CaseEvent,
    drafts: readonly FactDraft[],
    writerId: string,
  ): Promise<StoredCase> {
    const record: PersistedCaseEvent = { ...caseEvent, revision: 1, lastWriterId: writerId }

    try {
      const transaction = this.database.transaction(['cases', 'factDrafts'], 'readwrite')
      await transaction.objectStore('cases').put(record)
      for (const draft of drafts) {
        await transaction.objectStore('factDrafts').put(draft)
      }
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }

    return { caseEvent, revision: 1, lastWriterId: writerId }
  }

  async listCases(): Promise<readonly StoredCase[]> {
    try {
      const transaction = this.database.transaction('cases', 'readonly')
      const records = await transaction.objectStore('cases').getAll()
      await transaction.done
      return records.map(toStoredCase)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async getCase(caseId: UuidV4): Promise<CaseAggregate | null> {
    try {
      const transaction = this.database.transaction(['cases', 'factDrafts'], 'readonly')
      const record = await transaction.objectStore('cases').get(caseId)
      if (record === undefined) {
        await transaction.done
        return null
      }
      const drafts = await transaction
        .objectStore('factDrafts')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return { ...toStoredCase(record), factDrafts: drafts }
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async updateCase(command: UpdateCaseCommand): Promise<StoredCase> {
    try {
      const transaction = this.database.transaction('cases', 'readwrite')
      const store = transaction.objectStore('cases')
      const existing = await store.get(command.caseId)
      if (existing === undefined) {
        throw new CaseRepositoryError('storage_unavailable', '未找到本地事件')
      }
      if (existing.revision !== command.expectedRevision) {
        throw new CaseRepositoryError('concurrent_edit_conflict', '事件已在其他标签页被修改')
      }

      const updated: PersistedCaseEvent = {
        ...existing,
        ...command.patch,
        updatedAt: command.updatedAt,
        revision: existing.revision + 1,
        lastWriterId: command.writerId,
      }
      await store.put(updated)
      await transaction.done
      return toStoredCase(updated)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async replaceFactDrafts(
    caseId: UuidV4,
    expectedRevision: number,
    drafts: readonly FactDraft[],
    writerId: string,
  ): Promise<number> {
    try {
      const transaction = this.database.transaction(['cases', 'factDrafts'], 'readwrite')
      const caseStore = transaction.objectStore('cases')
      const existing = await caseStore.get(caseId)
      if (existing === undefined) {
        throw new CaseRepositoryError('storage_unavailable', '未找到本地事件')
      }
      if (existing.revision !== expectedRevision) {
        throw new CaseRepositoryError('concurrent_edit_conflict', '事件已在其他标签页被修改')
      }

      const updated: PersistedCaseEvent = {
        ...existing,
        revision: existing.revision + 1,
        lastWriterId: writerId,
      }
      await caseStore.put(updated)

      const draftStore = transaction.objectStore('factDrafts')
      let cursor = await draftStore.index('by_caseId').openCursor(caseId)
      while (cursor !== null) {
        await cursor.delete()
        cursor = await cursor.continue()
      }
      for (const draft of drafts) {
        await draftStore.put(draft)
      }
      await transaction.done
      return updated.revision
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listEvidence(caseId: UuidV4): Promise<readonly EvidenceFile[]> {
    try {
      const transaction = this.database.transaction('evidenceMetadata', 'readonly')
      const records = await transaction
        .objectStore('evidenceMetadata')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return records.sort((a, b) =>
        a.importedAt === b.importedAt
          ? a.id < b.id
            ? -1
            : 1
          : a.importedAt < b.importedAt
            ? -1
            : 1,
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async findEvidenceByHash(caseId: UuidV4, sha256: string): Promise<EvidenceFile | null> {
    try {
      const transaction = this.database.transaction('evidenceMetadata', 'readonly')
      const records = await transaction
        .objectStore('evidenceMetadata')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return records.find((record) => record.sha256 === sha256) ?? null
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async addReadyEvidence(evidence: EvidenceFile, operationId: UuidV4): Promise<void> {
    try {
      const transaction = this.database.transaction(
        ['evidenceMetadata', 'operationJournal'],
        'readwrite',
      )
      const operation = await transaction.objectStore('operationJournal').get(operationId)
      if (operation === undefined) {
        throw new CaseRepositoryError('storage_unavailable', '导入操作记录缺失')
      }
      await transaction.objectStore('evidenceMetadata').put(evidence)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async removeEvidence(evidenceId: UuidV4): Promise<void> {
    try {
      const transaction = this.database.transaction('evidenceMetadata', 'readwrite')
      await transaction.objectStore('evidenceMetadata').delete(evidenceId)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listConfirmedFacts(caseId: UuidV4): Promise<readonly ConfirmedFact[]> {
    try {
      const transaction = this.database.transaction('confirmedFacts', 'readonly')
      const records = await transaction
        .objectStore('confirmedFacts')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return records.sort((a, b) =>
        a.confirmedAt === b.confirmedAt
          ? a.id < b.id
            ? -1
            : 1
          : a.confirmedAt < b.confirmedAt
            ? -1
            : 1,
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async confirmFact(command: ConfirmFactCommand): Promise<ConfirmedFact> {
    try {
      const transaction = this.database.transaction(
        ['factDrafts', 'confirmedFacts', 'cases', 'evidenceMetadata'],
        'readwrite',
      )
      const draft = await transaction.objectStore('factDrafts').get(command.draftId)
      if (draft === undefined) {
        throw new CaseRepositoryError('storage_unavailable', '未找到事实草稿')
      }
      const caseId = draft.caseId

      const evidenceStore = transaction.objectStore('evidenceMetadata')
      for (const source of command.sourceRefs) {
        const evidence = await evidenceStore.get(source.evidenceId)
        if (evidence === undefined || evidence.caseId !== caseId) {
          throw new CaseRepositoryError('storage_unavailable', '来源材料不属于当前事件')
        }
      }

      let version = 1
      if (command.replacesFactId !== null) {
        const current = await transaction
          .objectStore('confirmedFacts')
          .get(command.replacesFactId)
        if (current === undefined || current.caseId !== caseId) {
          throw new CaseRepositoryError('storage_unavailable', '被替换的正式事实不存在')
        }
        version = current.version + 1
      }

      const confirmed = buildManualConfirmedFact({
        draft,
        id: command.confirmedFactId,
        confirmedAt: command.confirmedAt,
        sourceRefs: command.sourceRefs,
        replacesFactId: command.replacesFactId,
        version,
      })
      await transaction.objectStore('confirmedFacts').put(confirmed)

      const caseStore = transaction.objectStore('cases')
      const caseRecord = await caseStore.get(caseId)
      if (caseRecord !== undefined) {
        await caseStore.put({
          ...caseRecord,
          status: 'in_progress',
          updatedAt: command.confirmedAt,
          revision: caseRecord.revision + 1,
          lastWriterId: 'formal-confirmation',
        })
      }
      await transaction.done
      return confirmed
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async updateEvidenceCategory(
    caseId: UuidV4,
    evidenceId: UuidV4,
    category: EvidenceCategory,
  ): Promise<EvidenceFile> {
    try {
      const transaction = this.database.transaction('evidenceMetadata', 'readwrite')
      const store = transaction.objectStore('evidenceMetadata')
      const existing = await store.get(evidenceId)
      if (existing === undefined || existing.caseId !== caseId) {
        throw new CaseRepositoryError('storage_unavailable', '未找到材料')
      }
      const updated: EvidenceFile = { ...existing, category }
      await store.put(updated)
      await transaction.done
      return updated
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async putOperation(entry: OperationJournalEntry): Promise<void> {
    try {
      const transaction = this.database.transaction('operationJournal', 'readwrite')
      await transaction.objectStore('operationJournal').put(entry)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listOperations(): Promise<readonly OperationJournalEntry[]> {
    try {
      const transaction = this.database.transaction('operationJournal', 'readonly')
      const records = await transaction.objectStore('operationJournal').getAll()
      await transaction.done
      return records.sort((a, b) =>
        a.startedAt === b.startedAt
          ? a.operationId < b.operationId
            ? -1
            : 1
          : a.startedAt < b.startedAt
            ? -1
            : 1,
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async deleteOperation(operationId: UuidV4): Promise<void> {
    try {
      const transaction = this.database.transaction('operationJournal', 'readwrite')
      await transaction.objectStore('operationJournal').delete(operationId)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  close(): void {
    this.database.close()
  }
}
