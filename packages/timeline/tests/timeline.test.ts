import { describe, expect, it } from 'vitest'
import { detectTimelineConflicts, sortTimeline } from '../src/index.js'
import type { ConfirmedFact, TimelineEntry, UuidV4 } from '@youju/domain'

const caseId = '00000000-0000-4000-8000-000000000001'

function entry(
  id: string,
  sortOrder: number,
  occurredAt: string | null,
  summary: string,
  status: TimelineEntry['status'] = 'confirmed',
): TimelineEntry {
  return {
    id,
    caseId,
    occurredAt,
    timePrecision: occurredAt === null ? 'unknown' : 'minute',
    summary,
    detail: null,
    sourceRefs: [],
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
    status,
    sortOrder,
  }
}

function fact(
  id: string,
  fieldName: 'paid_amount',
  value: string,
  version: number,
  replacesFactId: UuidV4 | null,
): ConfirmedFact {
  return {
    id,
    caseId,
    factType: 'payment',
    fieldName,
    value,
    sourceRefs: [],
    confirmedAt: '2026-07-31T08:00:00.000Z',
    confirmationMethod: 'manual',
    derivedFromCandidateId: null,
    replacesFactId,
    version,
  }
}

describe('sortTimeline', () => {
  it('sorts known timestamps ascending with sortOrder and id tiebreaks', () => {
    const entries = [
      entry('00000000-0000-4000-8000-000000000401', 4, '2026-07-02T00:00:00.000Z', 'later'),
      entry('00000000-0000-4000-8000-000000000402', 1, '2026-07-01T00:00:00.000Z', 'earlier'),
      entry('00000000-0000-4000-8000-000000000403', 2, '2026-07-01T00:00:00.000Z', 'same-later'),
      entry('00000000-0000-4000-8000-000000000404', 0, '2026-07-01T00:00:00.000Z', 'same-first'),
    ]

    expect(sortTimeline(entries).map((item) => item.summary)).toEqual([
      'same-first',
      'earlier',
      'same-later',
      'later',
    ])
  })

  it('keeps unknown entries after known entries in user order', () => {
    const entries = [
      entry('00000000-0000-4000-8000-000000000411', 0, null, 'unknown-a'),
      entry('00000000-0000-4000-8000-000000000412', 2, '2026-07-01T00:00:00.000Z', 'known'),
      entry('00000000-0000-4000-8000-000000000413', 1, null, 'unknown-b'),
    ]

    expect(sortTimeline(entries).map((item) => item.summary)).toEqual([
      'known',
      'unknown-a',
      'unknown-b',
    ])
  })

  it('does not mutate the input array', () => {
    const entries = [
      entry('00000000-0000-4000-8000-000000000421', 1, '2026-07-02T00:00:00.000Z', 'later'),
      entry('00000000-0000-4000-8000-000000000422', 0, '2026-07-01T00:00:00.000Z', 'earlier'),
    ]
    const before = structuredClone(entries)

    const sorted = sortTimeline(entries)

    expect(entries).toEqual(before)
    expect(sorted).not.toBe(entries)
  })
})

describe('detectTimelineConflicts', () => {
  it('reports sequence_conflict when a later sortOrder has an earlier precise time', () => {
    const laterOrderEarlierTime = entry(
      '00000000-0000-4000-8000-000000000431',
      0,
      '2026-07-03T00:00:00.000Z',
      'newer-but-first',
    )
    const earlierOrderLaterTime = entry(
      '00000000-0000-4000-8000-000000000432',
      1,
      '2026-07-02T00:00:00.000Z',
      'older-but-second',
    )

    const conflicts = detectTimelineConflicts({
      entries: [laterOrderEarlierTime, earlierOrderLaterTime],
      currentFacts: [],
    })

    expect(conflicts).toContainEqual({
      type: 'sequence_conflict',
      timelineEntryIds: [
        '00000000-0000-4000-8000-000000000431',
        '00000000-0000-4000-8000-000000000432',
      ],
    })
  })

  it('reports fact_value_conflict for two current facts with the same field and unequal values', () => {
    const first = fact('00000000-0000-4000-8000-000000000441', 'paid_amount', '89900', 1, null)
    const second = fact('00000000-0000-4000-8000-000000000442', 'paid_amount', '90000', 1, null)

    const conflicts = detectTimelineConflicts({ entries: [], currentFacts: [first, second] })

    expect(conflicts).toContainEqual({
      type: 'fact_value_conflict',
      fieldName: 'paid_amount',
      confirmedFactIds: [
        '00000000-0000-4000-8000-000000000441',
        '00000000-0000-4000-8000-000000000442',
      ],
    })
  })

  it('ignores superseded fact history through current fact selection', () => {
    const oldVersion = fact(
      '00000000-0000-4000-8000-000000000451',
      'paid_amount',
      '89900',
      1,
      null,
    )
    const newVersion = fact(
      '00000000-0000-4000-8000-000000000452',
      'paid_amount',
      '90000',
      2,
      oldVersion.id,
    )

    const conflicts = detectTimelineConflicts({
      entries: [],
      currentFacts: [oldVersion, newVersion],
    })

    expect(conflicts).toEqual([])
  })

  it('ignores draft timeline entries when detecting conflicts', () => {
    const entries = [
      entry(
        '00000000-0000-4000-8000-000000000461',
        0,
        '2026-07-03T00:00:00.000Z',
        'newer-but-first',
        'draft',
      ),
      entry(
        '00000000-0000-4000-8000-000000000462',
        1,
        '2026-07-02T00:00:00.000Z',
        'older-but-second',
      ),
    ]

    const conflicts = detectTimelineConflicts({ entries, currentFacts: [] })

    expect(conflicts).toEqual([])
  })
})
