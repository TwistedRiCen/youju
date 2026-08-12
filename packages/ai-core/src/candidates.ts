import type {
  AiConfidenceLevel,
  ConfirmedFact,
  FactCandidate,
  FactFieldName,
  FactType,
  SourceReference,
  TimePrecision,
  TimelineEntry,
  UtcTimestamp,
  UuidV4,
} from '@youju/domain'

export type CandidateConflictType =
  | 'candidate_value_conflict'
  | 'formal_fact_conflict'
  | 'formal_timeline_conflict'

export interface CandidateSourceLocation {
  readonly evidenceId: UuidV4
  readonly page: number
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly region?: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

export interface CandidateBase {
  readonly id: UuidV4
  readonly caseId: UuidV4
  readonly analysisVersionId: UuidV4
  readonly candidateType: 'classification' | 'fact' | 'timeline' | 'statement'
  readonly reviewStatus: 'pending' | 'confirmed' | 'edited_and_confirmed' | 'rejected' | 'conflicted'
  readonly createdAt: UtcTimestamp
  readonly reviewedAt?: UtcTimestamp
  readonly confidenceLevel: AiConfidenceLevel
  readonly sourceRefs: readonly SourceReference[]
  readonly sourceLocations: readonly CandidateSourceLocation[]
  readonly conflictType?: CandidateConflictType
  readonly conflictingRecordId?: UuidV4
}

export type AiFactCandidate = FactCandidate & CandidateBase & {
  readonly candidateType: 'fact'
  readonly sourceLocations: readonly CandidateSourceLocation[]
}

export interface EvidenceClassificationCandidate extends CandidateBase {
  readonly candidateType: 'classification'
  readonly origin: 'ai'
  readonly evidenceId: UuidV4
  readonly category: string
  readonly value: string
  readonly normalizedValue: string
}

export interface AiTimelineCandidate extends CandidateBase {
  readonly candidateType: 'timeline'
  readonly origin: 'ai'
  readonly occurredAt: string | null
  readonly timePrecision: TimePrecision
  readonly summary: string
  readonly detail: string | null
}

export interface AiStatementCandidate extends CandidateBase {
  readonly candidateType: 'statement'
  readonly origin: 'ai'
  readonly text: string
  readonly confirmedFactIds: readonly UuidV4[]
  readonly confirmedTimelineEntryIds: readonly UuidV4[]
}

export type AiCandidate =
  | EvidenceClassificationCandidate
  | AiFactCandidate
  | AiTimelineCandidate
  | AiStatementCandidate

export interface CandidateConflict {
  readonly candidateId: UuidV4
  readonly type: CandidateConflictType
  readonly conflictingRecordId?: UuidV4
  readonly fieldName?: FactFieldName
}

export interface CandidateConflictInput {
  readonly candidates: readonly AiCandidate[]
  readonly currentFacts: readonly ConfirmedFact[]
  readonly currentTimeline: readonly TimelineEntry[]
}

export function isAiFactCandidate(candidate: AiCandidate): candidate is AiFactCandidate {
  return candidate.candidateType === 'fact'
}

export function isAiTimelineCandidate(candidate: AiCandidate): candidate is AiTimelineCandidate {
  return candidate.candidateType === 'timeline'
}

export type CandidateFactType = FactType
