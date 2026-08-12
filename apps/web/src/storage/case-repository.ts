import type {
  CaseEvent,
  ConfirmFactCommand,
  EvidenceCategory,
  EvidenceFile,
  FactDraft,
  ConfirmedFact,
  ConfirmedStatement,
  OperationJournalEntry,
  StatementDraft,
  TimelineEntry,
  UuidV4,
  UtcTimestamp,
} from '@youju/domain'

export interface StoredCase {
  readonly caseEvent: CaseEvent
  readonly revision: number
  readonly lastWriterId: string
}

export interface CaseAggregate extends StoredCase {
  readonly factDrafts: readonly FactDraft[]
}

export interface UpdateCaseCommand {
  readonly caseId: UuidV4
  readonly expectedRevision: number
  readonly patch: Partial<Pick<CaseEvent, 'title' | 'requestedResolution' | 'status'>>
  readonly updatedAt: UtcTimestamp
  readonly writerId: string
}

export type CaseRepositoryErrorCode =
  | 'concurrent_edit_conflict'
  | 'storage_not_supported'
  | 'storage_unavailable'

export class CaseRepositoryError extends Error {
  readonly code: CaseRepositoryErrorCode

  constructor(code: CaseRepositoryErrorCode, message: string) {
    super(message)
    this.name = 'CaseRepositoryError'
    this.code = code
  }
}

export function isCaseRepositoryError(error: unknown): error is CaseRepositoryError {
  return error instanceof CaseRepositoryError
}

export interface CaseRepository {
  createCase(
    caseEvent: CaseEvent,
    drafts: readonly FactDraft[],
    writerId: string,
  ): Promise<StoredCase>
  listCases(): Promise<readonly StoredCase[]>
  getCase(caseId: UuidV4): Promise<CaseAggregate | null>
  updateCase(command: UpdateCaseCommand): Promise<StoredCase>
  replaceFactDrafts(
    caseId: UuidV4,
    expectedRevision: number,
    drafts: readonly FactDraft[],
    writerId: string,
  ): Promise<number>
  listEvidence(caseId: UuidV4): Promise<readonly EvidenceFile[]>
  findEvidenceByHash(caseId: UuidV4, sha256: string): Promise<EvidenceFile | null>
  addReadyEvidence(evidence: EvidenceFile, operationId: UuidV4): Promise<void>
  removeEvidence(evidenceId: UuidV4): Promise<void>
  /** Deletes the case, M2 records, and any persisted M3 AI records. */
  deleteAllCaseRecords(caseId: UuidV4): Promise<void>
  listConfirmedFacts(caseId: UuidV4): Promise<readonly ConfirmedFact[]>
  confirmFact(command: ConfirmFactCommand): Promise<ConfirmedFact>
  putTimelineDraft(entry: TimelineEntry): Promise<void>
  confirmTimelineEntry(id: UuidV4): Promise<TimelineEntry>
  listTimeline(caseId: UuidV4): Promise<readonly TimelineEntry[]>
  reorderTimeline(caseId: UuidV4, orderedIds: readonly UuidV4[]): Promise<void>
  putStatementDraft(draft: StatementDraft): Promise<void>
  listStatementDrafts(caseId: UuidV4): Promise<readonly StatementDraft[]>
  appendConfirmedStatement(statement: ConfirmedStatement): Promise<void>
  listConfirmedStatements(caseId: UuidV4): Promise<readonly ConfirmedStatement[]>
  updateEvidenceCategory(
    caseId: UuidV4,
    evidenceId: UuidV4,
    category: EvidenceCategory,
  ): Promise<EvidenceFile>
  putOperation(entry: OperationJournalEntry): Promise<void>
  listOperations(): Promise<readonly OperationJournalEntry[]>
  deleteOperation(operationId: UuidV4): Promise<void>
  close(): void
}
