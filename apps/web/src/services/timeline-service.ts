import type { EvidenceFile, TimelineEntry, TimePrecision, UuidV4 } from '@youju/domain'
import { getCaseRepository } from './case-service.js'

export function toOccurredAt(precision: TimePrecision, raw: string): string | null {
  if (precision === 'unknown') {
    return null
  }
  if (precision === 'date') {
    const match = /^(\d{4}-\d{2}-\d{2})$/.exec(raw.trim())
    return match === null ? null : `${match[1]}T00:00:00.000Z`
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function toDisplayOccurredAt(entry: TimelineEntry): string {
  if (entry.occurredAt === null) {
    return ''
  }
  return entry.timePrecision === 'date'
    ? entry.occurredAt.slice(0, 10)
    : entry.occurredAt.slice(0, 16)
}

export interface TimelineSnapshot {
  readonly entries: readonly TimelineEntry[]
  readonly evidence: readonly EvidenceFile[]
}

export async function loadTimeline(caseId: UuidV4): Promise<TimelineSnapshot> {
  const repository = await getCaseRepository()
  return {
    entries: await repository.listTimeline(caseId),
    evidence: await repository.listEvidence(caseId),
  }
}

export async function saveTimelineDraft(entry: TimelineEntry): Promise<void> {
  const repository = await getCaseRepository()
  await repository.putTimelineDraft(entry)
}

export async function confirmTimelineEntry(id: UuidV4): Promise<TimelineEntry> {
  const repository = await getCaseRepository()
  return repository.confirmTimelineEntry(id)
}

export async function reorderTimeline(
  caseId: UuidV4,
  orderedIds: readonly UuidV4[],
): Promise<void> {
  const repository = await getCaseRepository()
  await repository.reorderTimeline(caseId, orderedIds)
}
