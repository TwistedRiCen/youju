import type {
  CaseEvent,
  ConfirmedFact,
  ConfirmedStatement,
  EvidenceCategory,
  EvidenceFile,
  FactFieldName,
  TimelineEntry,
  UtcTimestamp,
  UuidV4,
} from '@youju/domain'
import type { RuleFinding } from '@youju/rule-engine'
import type { TimelineConflict } from '@youju/timeline'

export interface EvidenceExportItem {
  readonly metadata: EvidenceFile
  readonly integrity:
    | { readonly status: 'verified'; readonly actualSha256: string }
    | { readonly status: 'missing' }
    | { readonly status: 'hash_mismatch'; readonly actualSha256: string }
}

export interface ExportSnapshot {
  readonly caseEvent: CaseEvent
  readonly confirmedFacts: readonly ConfirmedFact[]
  readonly confirmedTimeline: readonly TimelineEntry[]
  readonly statement: ConfirmedStatement
  readonly findings: readonly RuleFinding[]
  readonly evidence: readonly EvidenceExportItem[]
  readonly conflicts: readonly TimelineConflict[]
  readonly generatedAt: UtcTimestamp
  readonly appVersion: string
  readonly opfsAvailable: boolean
}

export type ExportBlockReason =
  | { readonly code: 'missing_required_fact'; readonly fieldName: FactFieldName }
  | { readonly code: 'missing_required_source'; readonly confirmedFactId: UuidV4 }
  | { readonly code: 'unresolved_conflict'; readonly conflictIndex: number }
  | { readonly code: 'timeline_unconfirmed'; readonly timelineEntryId: UuidV4 }
  | { readonly code: 'statement_missing' }
  | { readonly code: 'statement_stale' }
  | { readonly code: 'evidence_missing'; readonly evidenceId: UuidV4 }
  | { readonly code: 'evidence_hash_mismatch'; readonly evidenceId: UuidV4 }
  | { readonly code: 'opfs_unavailable' }

export type ExportWarning = {
  readonly code: 'recommended_evidence_missing'
  readonly evidenceCategory: EvidenceCategory
}

export type ExportPreflightResult =
  | { readonly status: 'ready'; readonly warnings: readonly ExportWarning[] }
  | {
      readonly status: 'blocked'
      readonly reasons: readonly ExportBlockReason[]
      readonly warnings: readonly ExportWarning[]
    }
