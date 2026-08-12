import { canBatchConfirm, transitionReview } from '@youju/ai-core'
import type { AiCandidate } from '@youju/ai-core'
import type { EvidenceFile, UtcTimestamp, UuidV4 } from '@youju/domain'
import type {
  AiRepository,
  CaseRepository,
  ConfirmAiCandidateCommand,
} from '../storage/index.js'

export interface AiReviewServiceDependencies {
  readonly aiRepository: AiRepository
  readonly caseRepository: CaseRepository
  readonly ruleVersion: string
}

export interface AiReviewService {
  confirm(command: ConfirmAiCandidateCommand): Promise<void>
  reject(candidateId: UuidV4, reviewedAt: UtcTimestamp): Promise<void>
  confirmEligibleBatch(candidateIds: readonly UuidV4[], reviewedAt: UtcTimestamp): Promise<void>
}

function serviceError(code: 'candidate_not_eligible' | 'storage_unavailable'): Error {
  return new Error(code)
}

function buildBatchCommand(candidate: AiCandidate, reviewedAt: UtcTimestamp): ConfirmAiCandidateCommand {
  switch (candidate.candidateType) {
    case 'classification':
      return { type: 'classification', candidateId: candidate.id, reviewedAt }
    case 'fact':
      return {
        type: 'fact',
        candidateId: candidate.id,
        confirmedFactId: crypto.randomUUID(),
        replacesFactId: null,
        reviewedAt,
      }
    case 'timeline':
      return {
        type: 'timeline',
        candidateId: candidate.id,
        timelineEntryId: crypto.randomUUID(),
        reviewedAt,
      }
    case 'statement':
      return {
        type: 'statement',
        candidateId: candidate.id,
        statementDraftId: crypto.randomUUID(),
        reviewedAt,
      }
  }
}

function hasAllSources(candidate: AiCandidate, evidence: readonly EvidenceFile[]): boolean {
  const evidenceIds = new Set(evidence.map((item) => item.id))
  return candidate.sourceRefs.every((source) => evidenceIds.has(source.evidenceId))
}

export function createAiReviewService(
  dependencies: AiReviewServiceDependencies,
): AiReviewService {
  return {
    async confirm(command): Promise<void> {
      const candidate = await dependencies.aiRepository.getCandidate(command.candidateId)
      if (candidate === null) {
        throw serviceError('storage_unavailable')
      }
      await dependencies.aiRepository.confirmCandidate(command, dependencies.ruleVersion)
    },

    async reject(candidateId, reviewedAt): Promise<void> {
      const candidate = await dependencies.aiRepository.getCandidate(candidateId)
      if (candidate === null) {
        throw serviceError('storage_unavailable')
      }
      await dependencies.aiRepository.putCandidate(
        transitionReview(candidate, { type: 'reject', reviewedAt }),
      )
    },

    async confirmEligibleBatch(candidateIds, reviewedAt): Promise<void> {
      const candidates: AiCandidate[] = []
      for (const candidateId of candidateIds) {
        const candidate = await dependencies.aiRepository.getCandidate(candidateId)
        if (candidate === null) {
          throw serviceError('storage_unavailable')
        }
        const analysis = await dependencies.aiRepository.getAnalysis(candidate.analysisVersionId)
        if (analysis === null) {
          throw serviceError('storage_unavailable')
        }
        const evidence = await dependencies.caseRepository.listEvidence(candidate.caseId)
        if (
          !canBatchConfirm(candidate, {
            analysisStatus: analysis.status,
            authorizedSources: candidate.sourceLocations,
            conflicts: [],
            materialsReady: hasAllSources(candidate, evidence),
            schemaValid: true,
          })
        ) {
          throw serviceError('candidate_not_eligible')
        }
        candidates.push(candidate)
      }
      await dependencies.aiRepository.confirmCandidates(
        candidates.map((candidate) => buildBatchCommand(candidate, reviewedAt)),
        dependencies.ruleVersion,
      )
    },
  }
}
