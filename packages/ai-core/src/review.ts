import type { AnalysisStatus, UtcTimestamp, UuidV4 } from '@youju/domain'
import type {
  AiCandidate,
  CandidateConflict,
  CandidateConflictType,
  CandidateSourceLocation,
} from './candidates.js'

export type ReviewCommand =
  | { readonly type: 'confirm'; readonly reviewedAt: UtcTimestamp }
  | { readonly type: 'edit_and_confirm'; readonly reviewedAt: UtcTimestamp }
  | { readonly type: 'reject'; readonly reviewedAt: UtcTimestamp }
  | {
      readonly type: 'mark_conflicted'
      readonly reviewedAt: UtcTimestamp
      readonly conflictType: CandidateConflictType
    }

export interface ReviewContext {
  readonly analysisStatus: AnalysisStatus
  readonly authorizedSources: readonly CandidateSourceLocation[]
  readonly conflicts: readonly CandidateConflict[]
  readonly materialsReady: boolean
  readonly schemaValid: boolean
}

function invalidTransition(): Error {
  return new Error('invalid_review_transition')
}

export function transitionReview(candidate: AiCandidate, command: ReviewCommand): AiCandidate {
  const pending = candidate.reviewStatus === 'pending'
  const conflicted = candidate.reviewStatus === 'conflicted'

  if (command.type === 'mark_conflicted') {
    if (!pending) {
      throw invalidTransition()
    }
    return {
      ...candidate,
      reviewStatus: 'conflicted',
      conflictType: command.conflictType,
      reviewedAt: command.reviewedAt,
    }
  }

  if (command.type === 'confirm') {
    if (!pending) {
      throw invalidTransition()
    }
    return { ...candidate, reviewStatus: 'confirmed', reviewedAt: command.reviewedAt }
  }

  if (command.type === 'edit_and_confirm') {
    if (!pending && !conflicted) {
      throw invalidTransition()
    }
    const edited = { ...candidate }
    delete edited.conflictType
    delete edited.conflictingRecordId
    return {
      ...edited,
      reviewStatus: 'edited_and_confirmed',
      reviewedAt: command.reviewedAt,
    }
  }

  if (command.type === 'reject') {
    if (!pending && !conflicted) {
      throw invalidTransition()
    }
    return { ...candidate, reviewStatus: 'rejected', reviewedAt: command.reviewedAt }
  }

  throw invalidTransition()
}

function sameSourcePage(a: CandidateSourceLocation, b: CandidateSourceLocation): boolean {
  return a.evidenceId === b.evidenceId &&
    a.page === b.page &&
    a.pixelWidth === b.pixelWidth &&
    a.pixelHeight === b.pixelHeight
}

export function canBatchConfirm(candidate: AiCandidate, context: ReviewContext): boolean {
  if (
    candidate.reviewStatus !== 'pending' ||
    candidate.confidenceLevel !== 'high' ||
    candidate.sourceRefs.length === 0 ||
    candidate.sourceLocations.length === 0 ||
    context.analysisStatus !== 'completed' ||
    !context.materialsReady ||
    !context.schemaValid ||
    candidate.conflictType !== undefined
  ) {
    return false
  }

  if (context.conflicts.some((conflict) => conflict.candidateId === candidate.id)) {
    return false
  }

  return candidate.sourceLocations.every((location) =>
    context.authorizedSources.some((authorized) => sameSourcePage(location, authorized)),
  )
}

export type { UuidV4 }
