import type { CaseEvent, FactDraft, UuidV4, UtcTimestamp } from '@youju/domain'

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
  close(): void
}
