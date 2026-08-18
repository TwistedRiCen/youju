import type { IDBPDatabase } from 'idb'
import type {
  CaseEvent,
  ConfirmFactCommand,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceCategory,
  EvidenceFile,
  FactDraft,
  OperationJournalEntry,
  StatementDraft,
  TimelineEntry,
  UuidV4,
  AnalysisVersion,
} from '@youju/domain'
import type { AiCandidate } from '@youju/ai-core'
import { buildManualConfirmedFact } from '@youju/domain'
import { CaseRepositoryError } from './case-repository.js'
import type {
  CaseAggregate,
  CaseRepository,
  StoredCase,
  UpdateCaseCommand,
} from './case-repository.js'
import type { PersistedCaseEvent, YouJuDatabaseSchema } from './database-schema.js'

interface PersistedCaseIdentity {
  readonly dataOrigin?: unknown
  readonly demoFixtureId?: unknown
}

type CaseIdentity =
  | { readonly dataOrigin: 'user_created'; readonly demoFixtureId: null }
  | { readonly dataOrigin: 'fictional_demo'; readonly demoFixtureId: string }

export function normalizePersistedCaseIdentity(
  record: PersistedCaseIdentity,
): CaseIdentity {
  if (record.dataOrigin === undefined && record.demoFixtureId === undefined) {
    return { dataOrigin: 'user_created', demoFixtureId: null }
  }
  if (record.dataOrigin === 'user_created' && record.demoFixtureId === null) {
    return { dataOrigin: 'user_created', demoFixtureId: null }
  }
  if (
    record.dataOrigin === 'fictional_demo' &&
    typeof record.demoFixtureId === 'string' &&
    record.demoFixtureId.length > 0
  ) {
    return { dataOrigin: 'fictional_demo', demoFixtureId: record.demoFixtureId }
  }
  throw new CaseRepositoryError('storage_unavailable', '本地事件来源身份无效')
}

function toCaseEvent(record: PersistedCaseEvent): CaseEvent {
  const common = {
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

  return {
    ...common,
    ...normalizePersistedCaseIdentity(record),
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

  async listAnalyses(caseId: UuidV4): Promise<readonly AnalysisVersion[]> {
    try {
      const transaction = this.database.transaction('analysisVersions', 'readonly')
      const records = await transaction.objectStore('analysisVersions').index('by_caseId').getAll(caseId)
      await transaction.done
      return records.sort((left, right) =>
        left.startedAt === right.startedAt
          ? left.id < right.id ? -1 : left.id === right.id ? 0 : 1
          : left.startedAt < right.startedAt ? -1 : 1,
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listCandidates(caseId: UuidV4): Promise<readonly AiCandidate[]> {
    try {
      const transaction = this.database.transaction('aiCandidates', 'readonly')
      const records = await transaction.objectStore('aiCandidates').index('by_caseId').getAll(caseId)
      await transaction.done
      return records.sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.id < right.id ? -1 : left.id === right.id ? 0 : 1
          : left.createdAt < right.createdAt ? -1 : 1,
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

  async deleteAllCaseRecords(caseId: UuidV4): Promise<void> {
    try {
      const transaction = this.database.transaction(
        [
          'cases',
          'factDrafts',
          'confirmedFacts',
          'timelineEntries',
          'statementDrafts',
          'confirmedStatements',
          'evidenceMetadata',
          'analysisVersions',
          'aiCandidates',
        ],
        'readwrite',
      )
      await transaction.objectStore('cases').delete(caseId)
      for (const storeName of [
        'factDrafts',
        'confirmedFacts',
        'timelineEntries',
        'statementDrafts',
        'confirmedStatements',
        'evidenceMetadata',
        'analysisVersions',
        'aiCandidates',
      ] as const) {
        let cursor = await transaction
          .objectStore(storeName)
          .index('by_caseId')
          .openCursor(caseId)
        while (cursor !== null) {
          await cursor.delete()
          cursor = await cursor.continue()
        }
      }
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

  async putTimelineDraft(entry: TimelineEntry): Promise<void> {
    try {
      const transaction = this.database.transaction(['timelineEntries', 'cases'], 'readwrite')
      await transaction.objectStore('timelineEntries').put({
        ...entry,
        contentOrigin: 'manual',
        derivedFromCandidateId: null,
      })
      const caseStore = transaction.objectStore('cases')
      const caseRecord = await caseStore.get(entry.caseId)
      if (caseRecord !== undefined) {
        await caseStore.put({
          ...caseRecord,
          revision: caseRecord.revision + 1,
          lastWriterId: 'timeline-draft',
        })
      }
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async confirmTimelineEntry(id: UuidV4): Promise<TimelineEntry> {
    try {
      const transaction = this.database.transaction(['timelineEntries', 'cases'], 'readwrite')
      const store = transaction.objectStore('timelineEntries')
      const entry = await store.get(id)
      if (entry === undefined) {
        throw new CaseRepositoryError('storage_unavailable', '未找到时间线条目')
      }
      const updated: TimelineEntry = { ...entry, status: 'confirmed' }
      await store.put(updated)

      const caseStore = transaction.objectStore('cases')
      const caseRecord = await caseStore.get(entry.caseId)
      if (caseRecord !== undefined) {
        await caseStore.put({
          ...caseRecord,
          status: 'in_progress',
          revision: caseRecord.revision + 1,
          lastWriterId: 'formal-timeline',
        })
      }
      await transaction.done
      return updated
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listTimeline(caseId: UuidV4): Promise<readonly TimelineEntry[]> {
    try {
      const transaction = this.database.transaction('timelineEntries', 'readonly')
      const records = await transaction
        .objectStore('timelineEntries')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return records.sort((a, b) =>
        a.sortOrder === b.sortOrder ? (a.id < b.id ? -1 : 1) : a.sortOrder - b.sortOrder,
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async reorderTimeline(
    caseId: UuidV4,
    orderedIds: readonly UuidV4[],
  ): Promise<void> {
    try {
      const transaction = this.database.transaction(['timelineEntries', 'cases'], 'readwrite')
      const store = transaction.objectStore('timelineEntries')
      for (let index = 0; index < orderedIds.length; index += 1) {
        const id = orderedIds[index]
        if (id === undefined) {
          throw new CaseRepositoryError('storage_unavailable', '时间线顺序无效')
        }
        const entry = await store.get(id)
        if (entry === undefined || entry.caseId !== caseId) {
          throw new CaseRepositoryError('storage_unavailable', '时间线条目不存在')
        }
        await store.put({ ...entry, sortOrder: index })
      }

      const caseStore = transaction.objectStore('cases')
      const caseRecord = await caseStore.get(caseId)
      if (caseRecord !== undefined) {
        await caseStore.put({
          ...caseRecord,
          status: 'in_progress',
          revision: caseRecord.revision + 1,
          lastWriterId: 'timeline-reorder',
        })
      }
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async putStatementDraft(draft: StatementDraft): Promise<void> {
    try {
      const transaction = this.database.transaction('statementDrafts', 'readwrite')
      await transaction.objectStore('statementDrafts').put({
        ...draft,
        contentOrigin: 'manual',
        derivedFromCandidateId: null,
      })
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listStatementDrafts(caseId: UuidV4): Promise<readonly StatementDraft[]> {
    try {
      const transaction = this.database.transaction('statementDrafts', 'readonly')
      const records = await transaction
        .objectStore('statementDrafts')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return records.sort((a, b) =>
        a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt < b.updatedAt ? -1 : 1,
      )
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async appendConfirmedStatement(statement: ConfirmedStatement): Promise<void> {
    try {
      const transaction = this.database.transaction('confirmedStatements', 'readwrite')
      await transaction.objectStore('confirmedStatements').put(statement)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listConfirmedStatements(caseId: UuidV4): Promise<readonly ConfirmedStatement[]> {
    try {
      const transaction = this.database.transaction('confirmedStatements', 'readonly')
      const records = await transaction
        .objectStore('confirmedStatements')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return records.sort((a, b) =>
        a.version === b.version ? (a.id < b.id ? -1 : 1) : a.version - b.version,
      )
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
      const updated: EvidenceFile = {
        ...existing,
        category,
        categoryOrigin: 'manual',
        categoryCandidateId: null,
      }
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
