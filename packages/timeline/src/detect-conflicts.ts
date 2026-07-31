import { selectCurrentConfirmedFacts } from '@youju/domain'
import type { ConfirmedFact, FactFieldName, TimelineEntry, UuidV4 } from '@youju/domain'

export type TimelineConflict =
  | {
      readonly type: 'sequence_conflict'
      readonly timelineEntryIds: readonly [UuidV4, UuidV4]
    }
  | {
      readonly type: 'fact_value_conflict'
      readonly fieldName: FactFieldName
      readonly confirmedFactIds: readonly UuidV4[]
    }

export function detectTimelineConflicts(input: {
  readonly entries: readonly TimelineEntry[]
  readonly currentFacts: readonly ConfirmedFact[]
}): TimelineConflict[] {
  const conflicts: TimelineConflict[] = []

  const confirmedByOrder = input.entries
    .filter((entry) => entry.status === 'confirmed')
    .slice()
    .sort((a, b) =>
      a.sortOrder === b.sortOrder ? (a.id < b.id ? -1 : 1) : a.sortOrder - b.sortOrder,
    )
  for (let index = 1; index < confirmedByOrder.length; index += 1) {
    const previous = confirmedByOrder[index - 1]
    const current = confirmedByOrder[index]
    if (
      previous !== undefined &&
      current !== undefined &&
      previous.occurredAt !== null &&
      current.occurredAt !== null &&
      previous.occurredAt > current.occurredAt
    ) {
      conflicts.push({
        type: 'sequence_conflict',
        timelineEntryIds: [previous.id, current.id],
      })
    }
  }

  const byField = new Map<FactFieldName, ConfirmedFact[]>()
  for (const fact of selectCurrentConfirmedFacts(input.currentFacts)) {
    const group = byField.get(fact.fieldName) ?? []
    group.push(fact)
    byField.set(fact.fieldName, group)
  }
  for (const [fieldName, group] of byField) {
    if (new Set(group.map((fact) => fact.value)).size > 1) {
      conflicts.push({
        type: 'fact_value_conflict',
        fieldName,
        confirmedFactIds: group.map((fact) => fact.id),
      })
    }
  }

  return conflicts
}
