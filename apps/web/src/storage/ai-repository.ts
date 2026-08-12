import type { AiCandidate } from '@youju/ai-core'
import type { AnalysisVersion, UtcTimestamp, UuidV4 } from '@youju/domain'

export type AiRepositoryErrorCode = 'invalid_ai_record' | 'storage_unavailable'

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
  putCandidate(candidate: AiCandidate): Promise<void>
  cancelInterruptedAnalyses(cancelledAt: UtcTimestamp): Promise<number>
  deleteAnalysis(id: UuidV4): Promise<void>
  deleteAllAiRecords(caseId: UuidV4): Promise<void>
}
