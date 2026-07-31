import type { EvidenceCategory, FactFieldName } from '@youju/domain'
import { requiresEvidenceSource } from '@youju/domain'
import type {
  ExportBlockReason,
  ExportPreflightResult,
  ExportSnapshot,
  ExportWarning,
} from './export-model.js'

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const expected = new Set(a)
  return b.every((id) => expected.has(id))
}

function statementStale(snapshot: ExportSnapshot): boolean {
  const ruleVersionMatches =
    snapshot.findings.length === 0 ||
    snapshot.statement.ruleVersion === snapshot.findings[0]?.ruleVersion
  return (
    !sameIdSet(
      snapshot.statement.confirmedFactIds,
      snapshot.confirmedFacts.map((fact) => fact.id),
    ) ||
    !sameIdSet(
      snapshot.statement.confirmedTimelineEntryIds,
      snapshot.confirmedTimeline.map((entry) => entry.id),
    ) ||
    !ruleVersionMatches
  )
}

export function validateExportSnapshot(snapshot: ExportSnapshot): ExportPreflightResult {
  const reasons: ExportBlockReason[] = []
  const warnings: ExportWarning[] = []

  for (const finding of snapshot.findings) {
    if (finding.resultType === 'missing_fact') {
      const fieldName = finding.sourceReference.match(/required-fact:([a-z_]+)$/)?.[1]
      if (fieldName !== undefined) {
        reasons.push({
          code: 'missing_required_fact',
          fieldName: fieldName as FactFieldName,
        })
      }
    }
    if (finding.resultType === 'missing_evidence') {
      const category = finding.sourceReference.match(/stable-method:([a-z_-]+)$/)?.[1]
      if (category !== undefined) {
        warnings.push({
          code: 'recommended_evidence_missing',
          evidenceCategory: category.replace(/-/g, '_') as EvidenceCategory,
        })
      }
    }
  }

  for (const fact of snapshot.confirmedFacts) {
    if (requiresEvidenceSource(fact.fieldName) && fact.sourceRefs.length === 0) {
      reasons.push({ code: 'missing_required_source', confirmedFactId: fact.id })
    }
  }

  snapshot.conflicts.forEach((conflict, conflictIndex) => {
    reasons.push({ code: 'unresolved_conflict', conflictIndex })
  })

  for (const entry of snapshot.confirmedTimeline) {
    if (entry.status !== 'confirmed') {
      reasons.push({ code: 'timeline_unconfirmed', timelineEntryId: entry.id })
    }
  }

  if (statementStale(snapshot)) {
    reasons.push({ code: 'statement_stale' })
  }

  for (const item of snapshot.evidence) {
    if (item.integrity.status === 'missing') {
      reasons.push({ code: 'evidence_missing', evidenceId: item.metadata.id })
    }
    if (item.integrity.status === 'hash_mismatch') {
      reasons.push({ code: 'evidence_hash_mismatch', evidenceId: item.metadata.id })
    }
  }

  if (!snapshot.opfsAvailable && snapshot.evidence.length > 0) {
    reasons.push({ code: 'opfs_unavailable' })
  }

  if (reasons.length > 0) {
    return { status: 'blocked', reasons, warnings }
  }
  return { status: 'ready', warnings }
}
