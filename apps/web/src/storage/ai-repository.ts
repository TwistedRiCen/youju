import type { AiCandidate } from '@youju/ai-core'
import type {
  AnalysisVersion,
  EvidenceCategory,
  TimePrecision,
  UtcTimestamp,
  UuidV4,
} from '@youju/domain'

export type AiRepositoryErrorCode =
  | 'analysis_is_referenced'
  | 'candidate_not_eligible'
  | 'invalid_ai_record'
  | 'storage_unavailable'

export class AiRepositoryError extends Error {
  readonly code: AiRepositoryErrorCode

  constructor(code: AiRepositoryErrorCode, message: string) {
    super(message)
    this.name = 'AiRepositoryError'
    this.code = code
  }
}

export interface AiRepository {
  createAnalysis(version: AnalysisVersion): Promise<void>
  updateAnalysis(version: AnalysisVersion): Promise<void>
  publishCompletedAnalysis(
    version: AnalysisVersion,
    candidates: readonly AiCandidate[],
  ): Promise<void>
  getAnalysis(id: UuidV4): Promise<AnalysisVersion | null>
  listAnalyses(caseId: UuidV4): Promise<readonly AnalysisVersion[]>
  listCandidates(caseId: UuidV4): Promise<readonly AiCandidate[]>
  getCandidate(id: UuidV4): Promise<AiCandidate | null>
  putCandidate(candidate: AiCandidate): Promise<void>
  confirmCandidate(command: ConfirmAiCandidateCommand, ruleVersion: string): Promise<void>
  confirmCandidates(
    commands: readonly ConfirmAiCandidateCommand[],
    ruleVersion: string,
  ): Promise<void>
  listAnalysisReferences(id: UuidV4): Promise<readonly AiAnalysisReference[]>
  cancelInterruptedAnalyses(cancelledAt: UtcTimestamp): Promise<number>
  deleteAnalysis(id: UuidV4): Promise<void>
  deleteAllAiRecords(caseId: UuidV4): Promise<void>
}

export interface TimelineCandidateEdit {
  readonly occurredAt?: UtcTimestamp | null
  readonly timePrecision?: TimePrecision
  readonly summary?: string
  readonly detail?: string | null
}

export type ConfirmAiCandidateCommand =
  | {
      readonly type: 'classification'
      readonly candidateId: UuidV4
      readonly editedCategory?: EvidenceCategory
      readonly reviewedAt: UtcTimestamp
    }
  | {
      readonly type: 'fact'
      readonly candidateId: UuidV4
      readonly editedValue?: string
      readonly confirmedFactId: UuidV4
      readonly replacesFactId: UuidV4 | null
      readonly reviewedAt: UtcTimestamp
    }
  | {
      readonly type: 'timeline'
      readonly candidateId: UuidV4
      readonly edited?: TimelineCandidateEdit
      readonly timelineEntryId: UuidV4
      readonly reviewedAt: UtcTimestamp
    }
  | {
      readonly type: 'statement'
      readonly candidateId: UuidV4
      readonly editedText?: string
      readonly statementDraftId: UuidV4
      readonly reviewedAt: UtcTimestamp
    }

export type AiAnalysisReference =
  | { readonly type: 'evidence_category'; readonly recordId: UuidV4 }
  | { readonly type: 'confirmed_fact'; readonly recordId: UuidV4 }
  | { readonly type: 'timeline_entry'; readonly recordId: UuidV4 }
  | { readonly type: 'statement_draft'; readonly recordId: UuidV4 }
  | { readonly type: 'confirmed_statement'; readonly recordId: UuidV4 }
