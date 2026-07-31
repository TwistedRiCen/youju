import { describe, expect, it } from 'vitest'
import { toDisplayOccurredAt, toOccurredAt } from '../src/services/timeline-service.js'
import type { TimelineEntry } from '@youju/domain'

describe('timeline time conversions', () => {
  it('keeps unknown precision without an occurred time', () => {
    expect(toOccurredAt('unknown', '')).toBeNull()
  })

  it('normalizes date precision to UTC midnight', () => {
    expect(toOccurredAt('date', '2026-07-03')).toBe('2026-07-03T00:00:00.000Z')
  })

  it('normalizes minute precision to a UTC timestamp', () => {
    expect(toOccurredAt('minute', '2026-07-01T12:16')).toBe(
      new Date('2026-07-01T12:16').toISOString(),
    )
  })

  it('returns null for invalid times instead of throwing', () => {
    expect(toOccurredAt('minute', 'not-a-time')).toBeNull()
  })

  it('displays date and unknown entries for editing', () => {
    const dateEntry: TimelineEntry = {
      id: '00000000-0000-4000-8000-000000000471',
      caseId: '00000000-0000-4000-8000-000000000001',
      occurredAt: '2026-07-03T00:00:00.000Z',
      timePrecision: 'date',
      summary: '收到商品',
      detail: null,
      sourceRefs: [],
      status: 'draft',
      sortOrder: 0,
    }
    const unknownEntry: TimelineEntry = {
      ...dateEntry,
      id: '00000000-0000-4000-8000-000000000472',
      occurredAt: null,
      timePrecision: 'unknown',
      summary: '商家拒绝退款',
    }

    expect(toDisplayOccurredAt(dateEntry)).toBe('2026-07-03')
    expect(toDisplayOccurredAt(unknownEntry)).toBe('')
  })
})
