import type { IDBPDatabase } from 'idb'
import type { CaseEvent, FactDraft, UuidV4 } from '@youju/domain'
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

  close(): void {
    this.database.close()
  }
}
