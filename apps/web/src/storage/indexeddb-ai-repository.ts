import { Value } from '@sinclair/typebox/value'
import type { IDBPDatabase } from 'idb'
import type { IDBPTransaction } from 'idb'
import { transitionReview } from '@youju/ai-core'
import type { AiCandidate } from '@youju/ai-core'
import {
  AnalysisVersionSchema,
  buildCandidateConfirmedFact,
  EvidenceCategorySchema,
} from '@youju/domain'
import type {
  AiFactCandidate,
  AiStatementCandidate,
  AiTimelineCandidate,
  EvidenceClassificationCandidate,
} from '@youju/ai-core'
import type {
  AnalysisVersion,
  StatementDraft,
  TimelineEntry,
  UtcTimestamp,
  UuidV4,
} from '@youju/domain'
import { AiRepositoryError } from './ai-repository.js'
import type {
  AiRepository,
  AiAnalysisReference,
  ConfirmAiCandidateCommand,
} from './ai-repository.js'
import type { YouJuDatabaseSchema } from './database-schema.js'

const FORBIDDEN_KEYS = new Set([
  'apiKey',
  'authorization',
  'providerApiKey',
  'prompt',
  'systemPrompt',
  'userPrompt',
  'requestBody',
  'responseBody',
  'rawModelOutput',
  'derivedBytes',
  'derivedImageBytes',
])

function assertNoSensitiveFields(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== 'object') {
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new AiRepositoryError('invalid_ai_record', 'AI 持久化记录包含禁止字段')
    }
    assertNoSensitiveFields(child, seen)
  }
}

function assertAnalysis(version: AnalysisVersion): void {
  assertNoSensitiveFields(version)
  if (!Value.Check(AnalysisVersionSchema, version)) {
    throw new AiRepositoryError('invalid_ai_record', '分析版本不符合持久化契约')
  }
}

function assertCandidate(candidate: AiCandidate): void {
  assertNoSensitiveFields(candidate)
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.caseId !== 'string' ||
    typeof candidate.analysisVersionId !== 'string' ||
    !Array.isArray(candidate.sourceRefs) ||
    !Array.isArray(candidate.sourceLocations)
  ) {
    throw new AiRepositoryError('invalid_ai_record', 'AI 候选不符合持久化契约')
  }
}

function toStorageError(error: unknown): AiRepositoryError {
  if (error instanceof AiRepositoryError) {
    return error
  }
  return new AiRepositoryError('storage_unavailable', '本地 AI 存储不可用')
}

function sortByStartedAt(left: AnalysisVersion, right: AnalysisVersion): number {
  return left.startedAt === right.startedAt
    ? left.id < right.id
      ? -1
      : left.id === right.id
        ? 0
        : 1
    : left.startedAt < right.startedAt
      ? -1
      : 1
}

function sortByCreatedAt(left: AiCandidate, right: AiCandidate): number {
  return left.createdAt === right.createdAt
    ? left.id < right.id
      ? -1
      : left.id === right.id
        ? 0
        : 1
    : left.createdAt < right.createdAt
      ? -1
      : 1
}

export class IndexedDbAiRepository implements AiRepository {
  constructor(
    private readonly database: IDBPDatabase<YouJuDatabaseSchema>,
    private readonly failureInjector?: (candidate: AiCandidate, index: number) => void,
    private readonly confirmationFailureInjector?: (step: 'candidate' | 'formal') => void,
  ) {}

  async createAnalysis(version: AnalysisVersion): Promise<void> {
    try {
      assertAnalysis(version)
      const transaction = this.database.transaction('analysisVersions', 'readwrite')
      await transaction.objectStore('analysisVersions').add(version)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async updateAnalysis(version: AnalysisVersion): Promise<void> {
    try {
      assertAnalysis(version)
      const transaction = this.database.transaction('analysisVersions', 'readwrite')
      await transaction.objectStore('analysisVersions').put(version)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async publishCompletedAnalysis(
    version: AnalysisVersion,
    candidates: readonly AiCandidate[],
  ): Promise<void> {
    let publicationTransaction: { abort(): void; done: Promise<unknown> } | undefined
    try {
      assertAnalysis(version)
      if (version.status !== 'completed') {
        throw new AiRepositoryError('invalid_ai_record', '发布分析必须使用 completed 状态')
      }

      const transaction = this.database.transaction(
        ['analysisVersions', 'aiCandidates'],
        'readwrite',
      )
      publicationTransaction = transaction
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        if (candidate === undefined) {
          throw new AiRepositoryError('invalid_ai_record', 'AI 候选不能为空')
        }
        assertCandidate(candidate)
        if (candidate.caseId !== version.caseId || candidate.analysisVersionId !== version.id) {
          throw new AiRepositoryError('invalid_ai_record', 'AI 候选与分析版本不匹配')
        }
        this.failureInjector?.(candidate, index)
        await transaction.objectStore('aiCandidates').add(candidate)
      }
      await transaction.objectStore('analysisVersions').put(version)
      await transaction.done
    } catch (error) {
      try {
        publicationTransaction?.abort()
        await publicationTransaction?.done
      } catch {
        // The transaction may already have been aborted by IndexedDB.
      }
      try {
        await this.markAnalysisFailed(version.id)
      } catch {
        // Keep the original failure while the aborted publication remains uncommitted.
      }
      throw toStorageError(error)
    }
  }

  async getAnalysis(id: UuidV4): Promise<AnalysisVersion | null> {
    try {
      const transaction = this.database.transaction('analysisVersions', 'readonly')
      const version = await transaction.objectStore('analysisVersions').get(id)
      await transaction.done
      return version ?? null
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listAnalyses(caseId: UuidV4): Promise<readonly AnalysisVersion[]> {
    try {
      const transaction = this.database.transaction('analysisVersions', 'readonly')
      const versions = await transaction
        .objectStore('analysisVersions')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return versions.sort(sortByStartedAt)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async listCandidates(caseId: UuidV4): Promise<readonly AiCandidate[]> {
    try {
      const transaction = this.database.transaction('aiCandidates', 'readonly')
      const candidates = await transaction
        .objectStore('aiCandidates')
        .index('by_caseId')
        .getAll(caseId)
      await transaction.done
      return candidates.sort(sortByCreatedAt)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async getCandidate(id: UuidV4): Promise<AiCandidate | null> {
    try {
      const transaction = this.database.transaction('aiCandidates', 'readonly')
      const candidate = await transaction.objectStore('aiCandidates').get(id)
      await transaction.done
      return candidate ?? null
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async putCandidate(candidate: AiCandidate): Promise<void> {
    try {
      assertCandidate(candidate)
      const transaction = this.database.transaction('aiCandidates', 'readwrite')
      await transaction.objectStore('aiCandidates').put(candidate)
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async confirmCandidate(command: ConfirmAiCandidateCommand, ruleVersion: string): Promise<void> {
    let transaction: IDBPTransaction<
      YouJuDatabaseSchema,
      ['cases', 'analysisVersions', 'evidenceMetadata', 'confirmedFacts', 'timelineEntries', 'statementDrafts', 'aiCandidates'],
      'readwrite'
    > | undefined
    try {
      transaction = this.database.transaction(
        [
          'cases',
          'analysisVersions',
          'evidenceMetadata',
          'confirmedFacts',
          'timelineEntries',
          'statementDrafts',
          'aiCandidates',
        ],
        'readwrite',
      )
      await this.confirmInTransaction(transaction, command, ruleVersion)
      await transaction.done
    } catch (error) {
      try {
        transaction?.abort()
        await transaction?.done
      } catch {
        // The transaction may already have been aborted.
      }
      throw toStorageError(error)
    }
  }

  async confirmCandidates(
    commands: readonly ConfirmAiCandidateCommand[],
    ruleVersion: string,
  ): Promise<void> {
    let transaction: IDBPTransaction<
      YouJuDatabaseSchema,
      ['cases', 'analysisVersions', 'evidenceMetadata', 'confirmedFacts', 'timelineEntries', 'statementDrafts', 'aiCandidates'],
      'readwrite'
    > | undefined
    try {
      transaction = this.database.transaction(
        [
          'cases',
          'analysisVersions',
          'evidenceMetadata',
          'confirmedFacts',
          'timelineEntries',
          'statementDrafts',
          'aiCandidates',
        ],
        'readwrite',
      )
      for (const command of commands) {
        await this.confirmInTransaction(transaction, command, ruleVersion)
      }
      await transaction.done
    } catch (error) {
      try {
        transaction?.abort()
        await transaction?.done
      } catch {
        // The transaction may already have been aborted.
      }
      throw toStorageError(error)
    }
  }

  async listAnalysisReferences(id: UuidV4): Promise<readonly AiAnalysisReference[]> {
    try {
      const transaction = this.database.transaction(
        [
          'evidenceMetadata',
          'confirmedFacts',
          'timelineEntries',
          'statementDrafts',
          'confirmedStatements',
          'aiCandidates',
        ],
        'readonly',
      )
      const candidates = await transaction
        .objectStore('aiCandidates')
        .index('by_analysisVersionId')
        .getAll(id)
      const candidateIds = new Set(candidates.map((candidate) => candidate.id))
      const references: AiAnalysisReference[] = []
      const evidence = await transaction.objectStore('evidenceMetadata').getAll()
      for (const item of evidence) {
        if (item.categoryCandidateId !== null && candidateIds.has(item.categoryCandidateId)) {
          references.push({ type: 'evidence_category', recordId: item.id })
        }
      }
      const facts = await transaction.objectStore('confirmedFacts').getAll()
      for (const fact of facts) {
        if (fact.derivedFromCandidateId !== null && candidateIds.has(fact.derivedFromCandidateId)) {
          references.push({ type: 'confirmed_fact', recordId: fact.id })
        }
      }
      const timeline = await transaction.objectStore('timelineEntries').getAll()
      for (const entry of timeline) {
        if (entry.derivedFromCandidateId !== null && candidateIds.has(entry.derivedFromCandidateId)) {
          references.push({ type: 'timeline_entry', recordId: entry.id })
        }
      }
      const drafts = await transaction.objectStore('statementDrafts').getAll()
      for (const draft of drafts) {
        if (draft.derivedFromCandidateId !== null && candidateIds.has(draft.derivedFromCandidateId)) {
          references.push({ type: 'statement_draft', recordId: draft.id })
        }
      }
      const statements = await transaction.objectStore('confirmedStatements').getAll()
      for (const statement of statements) {
        if (statement.derivedFromCandidateId !== null && candidateIds.has(statement.derivedFromCandidateId)) {
          references.push({ type: 'confirmed_statement', recordId: statement.id })
        }
      }
      await transaction.done
      return references
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async cancelInterruptedAnalyses(cancelledAt: UtcTimestamp): Promise<number> {
    try {
      const transaction = this.database.transaction('analysisVersions', 'readwrite')
      const store = transaction.objectStore('analysisVersions')
      const versions = await store.getAll()
      let cancelledCount = 0
      for (const version of versions) {
        if (version.status !== 'running') {
          continue
        }
        await store.put({
          ...version,
          status: 'cancelled',
          completedAt: cancelledAt,
          errorCode: 'request_cancelled',
        })
        cancelledCount += 1
      }
      await transaction.done
      return cancelledCount
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async deleteAnalysis(id: UuidV4): Promise<void> {
    try {
      const references = await this.listAnalysisReferences(id)
      if (references.length > 0) {
        throw new AiRepositoryError('analysis_is_referenced', '分析版本仍被正式记录引用')
      }
      const transaction = this.database.transaction(
        ['analysisVersions', 'aiCandidates'],
        'readwrite',
      )
      await transaction.objectStore('analysisVersions').delete(id)
      let cursor = await transaction
        .objectStore('aiCandidates')
        .index('by_analysisVersionId')
        .openCursor(id)
      while (cursor !== null) {
        await cursor.delete()
        cursor = await cursor.continue()
      }
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async deleteAllAiRecords(caseId: UuidV4): Promise<void> {
    try {
      const transaction = this.database.transaction(
        ['analysisVersions', 'aiCandidates'],
        'readwrite',
      )
      for (const storeName of ['analysisVersions', 'aiCandidates'] as const) {
        let cursor = await transaction.objectStore(storeName).index('by_caseId').openCursor(caseId)
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

  private async markAnalysisFailed(id: UuidV4): Promise<void> {
    const transaction = this.database.transaction('analysisVersions', 'readwrite')
    const existing = await transaction.objectStore('analysisVersions').get(id)
    if (existing !== undefined && existing.status === 'running') {
      await transaction.objectStore('analysisVersions').put({
        ...existing,
        status: 'failed',
        errorCode: 'publication_failed',
      })
    }
    await transaction.done
  }

  private async confirmInTransaction(
    transaction: IDBPTransaction<
      YouJuDatabaseSchema,
      ['cases', 'analysisVersions', 'evidenceMetadata', 'confirmedFacts', 'timelineEntries', 'statementDrafts', 'aiCandidates'],
      'readwrite'
    >,
    command: ConfirmAiCandidateCommand,
    ruleVersion: string,
  ): Promise<void> {
    const candidateStore = transaction.objectStore('aiCandidates')
    const candidate = await candidateStore.get(command.candidateId)
    if (candidate === undefined) {
      throw new AiRepositoryError('storage_unavailable', '未找到 AI 候选')
    }
    const analysis = await transaction.objectStore('analysisVersions').get(candidate.analysisVersionId)
    if (analysis === undefined || analysis.status !== 'completed') {
      throw new AiRepositoryError('candidate_not_eligible', '分析版本尚未完成')
    }
    if (candidate.candidateType !== command.type) {
      throw new AiRepositoryError('invalid_ai_record', '候选类型与确认命令不匹配')
    }

    const isEdited =
      (command.type === 'classification' && command.editedCategory !== undefined) ||
      (command.type === 'fact' && command.editedValue !== undefined) ||
      (command.type === 'timeline' && command.edited !== undefined) ||
      (command.type === 'statement' && command.editedText !== undefined)
    const reviewed = transitionReview(candidate, {
      type: isEdited ? 'edit_and_confirm' : 'confirm',
      reviewedAt: command.reviewedAt,
    })
    this.confirmationFailureInjector?.('candidate')
    await candidateStore.put(reviewed)
    this.confirmationFailureInjector?.('formal')

    if (command.type === 'fact') {
      const confirmedFacts = transaction.objectStore('confirmedFacts')
      const current = command.replacesFactId === null
        ? undefined
        : await confirmedFacts.get(command.replacesFactId)
      if (command.replacesFactId !== null && (current === undefined || current.caseId !== candidate.caseId)) {
        throw new AiRepositoryError('storage_unavailable', '待替换正式事实不存在')
      }
      const factCandidate = candidate as AiFactCandidate
      const factInput = {
        candidate: factCandidate,
        id: command.confirmedFactId,
        confirmedAt: command.reviewedAt,
        replacesFactId: command.replacesFactId,
        version: current === undefined ? 1 : current.version + 1,
      }
      const confirmed = command.editedValue === undefined
        ? buildCandidateConfirmedFact(factInput)
        : buildCandidateConfirmedFact({ ...factInput, editedValue: command.editedValue })
      await confirmedFacts.put(confirmed)
      return
    }

    if (command.type === 'classification') {
      const evidenceStore = transaction.objectStore('evidenceMetadata')
      const classificationCandidate = candidate as EvidenceClassificationCandidate
      const evidence = await evidenceStore.get(classificationCandidate.evidenceId)
      if (evidence === undefined || evidence.caseId !== candidate.caseId) {
        throw new AiRepositoryError('storage_unavailable', '分类候选来源材料不存在')
      }
      const category = command.editedCategory ?? classificationCandidate.category
      if (!Value.Check(EvidenceCategorySchema, category)) {
        throw new AiRepositoryError('invalid_ai_record', '分类候选不符合领域枚举')
      }
      await evidenceStore.put({
        ...evidence,
        category,
        categoryOrigin: isEdited ? 'candidate_edited' : 'candidate_confirmed',
        categoryCandidateId: candidate.id,
      })
      return
    }

    if (command.type === 'timeline') {
      const timelineCandidate = candidate as AiTimelineCandidate
      const edit = command.edited ?? {}
      const entries = transaction.objectStore('timelineEntries')
      const existing = await entries.index('by_caseId').getAll(candidate.caseId)
      const sortOrder = existing.reduce((max: number, entry: TimelineEntry) => Math.max(max, entry.sortOrder), -1) + 1
      const timeline: TimelineEntry = {
        id: command.timelineEntryId,
        caseId: candidate.caseId,
        occurredAt: edit.occurredAt ?? timelineCandidate.occurredAt as UtcTimestamp | null,
        timePrecision: edit.timePrecision ?? timelineCandidate.timePrecision,
        summary: edit.summary ?? timelineCandidate.summary,
        detail: edit.detail ?? timelineCandidate.detail,
        sourceRefs: [...candidate.sourceRefs],
        contentOrigin: isEdited ? 'candidate_edited' : 'candidate_confirmed',
        derivedFromCandidateId: candidate.id,
        status: 'confirmed',
        sortOrder,
      }
      await entries.put(timeline)
      return
    }

    const statementCandidate = candidate as AiStatementCandidate
    const cases = transaction.objectStore('cases')
    const caseRecord = await cases.get(candidate.caseId)
    const statement: StatementDraft = {
      id: command.statementDraftId,
      caseId: candidate.caseId,
      content: command.editedText ?? statementCandidate.text,
      confirmedFactIds: [...statementCandidate.confirmedFactIds],
      confirmedTimelineEntryIds: [...statementCandidate.confirmedTimelineEntryIds],
      contentOrigin: isEdited ? 'candidate_edited' : 'candidate_confirmed',
      derivedFromCandidateId: candidate.id,
      ruleVersion,
      updatedAt: command.reviewedAt,
      revision: caseRecord?.revision ?? 1,
    }
    await transaction.objectStore('statementDrafts').put(statement)
  }
}
