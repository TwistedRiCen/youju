import type { TimelineEntry } from '@youju/domain'

function compareUserOrder(a: TimelineEntry, b: TimelineEntry): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function sortTimeline(entries: readonly TimelineEntry[]): TimelineEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.occurredAt === null && b.occurredAt === null) {
      return compareUserOrder(a, b)
    }
    if (a.occurredAt === null) {
      return 1
    }
    if (b.occurredAt === null) {
      return -1
    }
    if (a.occurredAt !== b.occurredAt) {
      return a.occurredAt < b.occurredAt ? -1 : 1
    }
    return compareUserOrder(a, b)
  })
}
