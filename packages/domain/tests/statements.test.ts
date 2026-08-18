import { describe, expect, it } from 'vitest'
import {
  buildStatementDraft,
  confirmStatement,
  isStatementCurrent,
} from '../src/index.js'
import type {
  CaseEvent,
  ConfirmedFact,
  StatementDraft,
  TimelineEntry,
} from '../src/index.js'

const caseId = '00000000-0000-4000-8000-000000000001'

const caseEvent: CaseEvent = {
  id: caseId,
  scenarioType: 'ecommerce_refund',
  title: '运输破损退款纠纷',
  createdAt: '2026-07-31T09:00:00.000Z',
  updatedAt: '2026-07-31T09:00:00.000Z',
  status: 'in_progress',
  requestedResolution: '退货并退还已支付金额89900分',
  storageMode: 'local',
  schemaVersion: 1,
  dataOrigin: 'user_created',
  demoFixtureId: null,
}

function confirmedFact(
  id: string,
  fieldName: 'purchase_time' | 'merchant_name' | 'product_name' | 'paid_amount' | 'problem_description' | 'requested_resolution',
  value: string,
): ConfirmedFact {
  const base = {
    id,
    caseId,
    value,
    sourceRefs: [],
    confirmedAt: '2026-07-31T09:10:00.000Z',
    confirmationMethod: 'manual' as const,
    derivedFromCandidateId: null,
    replacesFactId: null,
    version: 1,
  }
  switch (fieldName) {
    case 'purchase_time':
      return { ...base, factType: 'order', fieldName: 'purchase_time' }
    case 'merchant_name':
      return { ...base, factType: 'merchant', fieldName: 'merchant_name' }
    case 'product_name':
      return { ...base, factType: 'product', fieldName: 'product_name' }
    case 'paid_amount':
      return { ...base, factType: 'payment', fieldName: 'paid_amount' }
    case 'problem_description':
      return { ...base, factType: 'issue', fieldName: 'problem_description' }
    case 'requested_resolution':
      return { ...base, factType: 'resolution', fieldName: 'requested_resolution' }
  }
}

const confirmedFacts: readonly ConfirmedFact[] = [
  confirmedFact('00000000-0000-4000-8000-000000000601', 'purchase_time', '2026-07-01T12:16:00.000Z'),
  confirmedFact('00000000-0000-4000-8000-000000000602', 'merchant_name', '晴川生活示例店'),
  confirmedFact('00000000-0000-4000-8000-000000000603', 'product_name', '便携折叠桌（虚构商品）'),
  confirmedFact('00000000-0000-4000-8000-000000000604', 'paid_amount', '89900'),
  confirmedFact('00000000-0000-4000-8000-000000000605', 'problem_description', '包裹外箱凹陷'),
  confirmedFact('00000000-0000-4000-8000-000000000606', 'requested_resolution', '退货并退还已支付金额89900分'),
]

const confirmedTimeline: readonly TimelineEntry[] = [
  {
    id: '00000000-0000-4000-8000-000000000701',
    caseId,
    occurredAt: '2026-07-01T12:16:00.000Z',
    timePrecision: 'minute',
    summary: '下单',
    detail: null,
    sourceRefs: [],
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
    status: 'confirmed',
    sortOrder: 0,
  },
]

const findings = [{ message: '建议补充：商家沟通记录' }]

describe('deterministic statement draft', () => {
  it('builds content from confirmed facts, timeline and findings without legal conclusions', () => {
    const draft = buildStatementDraft({
      caseEvent,
      confirmedFacts,
      confirmedTimeline,
      findings,
      ruleVersion: '1.0.0',
      updatedAt: '2026-07-31T09:20:00.000Z',
      revision: 7,
    })

    expect(draft.content).toContain('2026年7月1日')
    expect(draft.content).toContain('晴川生活示例店')
    expect(draft.content).toContain('退货并退还已支付金额89900分')
    expect(draft.content).toContain('下单')
    expect(draft.content).toContain('建议补充：商家沟通记录')
    expect(draft.content).not.toMatch(/违法|赔偿|胜诉率|成功率/)
    expect(draft.confirmedFactIds).toEqual(confirmedFacts.map(({ id }) => id))
    expect(draft.confirmedTimelineEntryIds).toEqual(confirmedTimeline.map(({ id }) => id))
    expect(draft.ruleVersion).toBe('1.0.0')
    expect(draft.contentOrigin).toBe('manual')
    expect(draft.derivedFromCandidateId).toBeNull()
    expect(draft.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})

describe('statement confirmation and currency', () => {
  it('confirms a draft into a versioned statement', () => {
    const draft = buildStatementDraft({
      caseEvent,
      confirmedFacts,
      confirmedTimeline,
      findings,
      ruleVersion: '1.0.0',
      updatedAt: '2026-07-31T09:20:00.000Z',
      revision: 7,
    })

    const confirmed = confirmStatement({
      draft,
      id: '00000000-0000-4000-8000-000000000801',
      confirmedAt: '2026-07-31T09:30:00.000Z',
      version: 1,
    })

    expect(confirmed).toMatchObject({
      id: '00000000-0000-4000-8000-000000000801',
      caseId,
      ruleVersion: '1.0.0',
      confirmedAt: '2026-07-31T09:30:00.000Z',
      version: 1,
    })
    expect(confirmed.confirmedFactIds).toEqual(confirmedFacts.map(({ id }) => id))
    expect(confirmed.contentOrigin).toBe('manual')
    expect(confirmed.derivedFromCandidateId).toBeNull()
  })

  it('preserves candidate provenance when confirming an AI-derived statement draft', () => {
    const draft: StatementDraft = {
      id: '00000000-0000-4000-8000-000000000802',
      caseId,
      content: 'AI 璁剧疆鐨勭敤鎴峰€欓€夋枃鏈?',
      confirmedFactIds: [confirmedFacts[0]!.id],
      confirmedTimelineEntryIds: [confirmedTimeline[0]!.id],
      contentOrigin: 'candidate_edited',
      derivedFromCandidateId: '00000000-0000-4000-8000-000000000810',
      ruleVersion: '1.0.0',
      updatedAt: '2026-07-31T09:25:00.000Z',
      revision: 8,
    }

    const confirmed = confirmStatement({
      draft,
      id: '00000000-0000-4000-8000-000000000803',
      confirmedAt: '2026-07-31T09:30:00.000Z',
      version: 2,
    })

    expect(confirmed.contentOrigin).toBe('candidate_edited')
    expect(confirmed.derivedFromCandidateId).toBe('00000000-0000-4000-8000-000000000810')
  })

  it('is current only when fact ids, timeline ids and rule version match the snapshot', () => {
    const draft = buildStatementDraft({
      caseEvent,
      confirmedFacts,
      confirmedTimeline,
      findings,
      ruleVersion: '1.0.0',
      updatedAt: '2026-07-31T09:20:00.000Z',
      revision: 7,
    })
    const statement = confirmStatement({
      draft,
      id: '00000000-0000-4000-8000-000000000801',
      confirmedAt: '2026-07-31T09:30:00.000Z',
      version: 1,
    })
    const identity = {
      confirmedFactIds: confirmedFacts.map(({ id }) => id),
      confirmedTimelineEntryIds: confirmedTimeline.map(({ id }) => id),
      ruleVersion: '1.0.0',
    }

    expect(isStatementCurrent(statement, identity)).toBe(true)

    const replacedFactId = confirmedFacts.map(({ id }) => id).slice()
    replacedFactId[1] = '00000000-0000-4000-8000-000000000900'
    expect(
      isStatementCurrent(statement, { ...identity, confirmedFactIds: replacedFactId }),
    ).toBe(false)

    const extraTimelineId = [...confirmedTimeline.map(({ id }) => id), '00000000-0000-4000-8000-000000000701']
    expect(
      isStatementCurrent(statement, { ...identity, confirmedTimelineEntryIds: extraTimelineId }),
    ).toBe(false)

    expect(isStatementCurrent(statement, { ...identity, ruleVersion: '1.1.0' })).toBe(false)
  })
})
