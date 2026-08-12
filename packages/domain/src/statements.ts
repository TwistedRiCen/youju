import type {
  CaseEvent,
  ConfirmedFact,
  ConfirmedStatement,
  StatementDraft,
  TimelineEntry,
  UtcTimestamp,
  UuidV4,
} from './schemas.js'

export interface FormalSnapshotIdentity {
  readonly confirmedFactIds: readonly UuidV4[]
  readonly confirmedTimelineEntryIds: readonly UuidV4[]
  readonly ruleVersion: string
}

export interface StatementFinding {
  readonly message: string
}

export interface BuildStatementDraftInput {
  readonly caseEvent: CaseEvent
  readonly confirmedFacts: readonly ConfirmedFact[]
  readonly confirmedTimeline: readonly TimelineEntry[]
  readonly findings: readonly StatementFinding[]
  readonly ruleVersion: string
  readonly updatedAt: UtcTimestamp
  readonly revision: number
}

function factValue(fieldName: string, facts: readonly ConfirmedFact[]): string {
  return facts.find((fact) => fact.fieldName === fieldName)?.value ?? ''
}

function formatChineseDate(iso: string): string {
  const year = iso.slice(0, 4)
  const month = String(Number(iso.slice(5, 7)))
  const day = String(Number(iso.slice(8, 10)))
  return `${year}年${month}月${day}日`
}

export function buildStatementDraft(input: BuildStatementDraftInput): StatementDraft {
  const purchaseTime = factValue('purchase_time', input.confirmedFacts)
  const lines = [
    `事件：${input.caseEvent.title}`,
    `购买时间：${purchaseTime === '' ? '未填写' : formatChineseDate(purchaseTime)}`,
    `商家：${factValue('merchant_name', input.confirmedFacts)}`,
    `商品：${factValue('product_name', input.confirmedFacts)}`,
    `实付金额：${factValue('paid_amount', input.confirmedFacts)}`,
    `问题描述：${factValue('problem_description', input.confirmedFacts)}`,
    `期望处理结果：${factValue('requested_resolution', input.confirmedFacts)}`,
    ...input.confirmedTimeline.map((entry) => `时间线：${entry.summary}`),
    ...input.findings.map((finding) => `规则提示：${finding.message}`),
  ]
  return {
    id: crypto.randomUUID(),
    caseId: input.caseEvent.id,
    content: lines.join('\n'),
    confirmedFactIds: input.confirmedFacts.map(({ id }) => id),
    confirmedTimelineEntryIds: input.confirmedTimeline.map(({ id }) => id),
    contentOrigin: 'manual',
    derivedFromCandidateId: null,
    ruleVersion: input.ruleVersion,
    updatedAt: input.updatedAt,
    revision: input.revision,
  }
}

export interface ConfirmStatementInput {
  readonly draft: StatementDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
  readonly version: number
}

export function confirmStatement(input: ConfirmStatementInput): ConfirmedStatement {
  return {
    id: input.id,
    caseId: input.draft.caseId,
    content: input.draft.content,
    confirmedFactIds: [...input.draft.confirmedFactIds],
    confirmedTimelineEntryIds: [...input.draft.confirmedTimelineEntryIds],
    contentOrigin: input.draft.contentOrigin,
    derivedFromCandidateId: input.draft.derivedFromCandidateId,
    ruleVersion: input.draft.ruleVersion,
    confirmedAt: input.confirmedAt,
    version: input.version,
  }
}

function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const expected = new Set(a)
  return b.every((id) => expected.has(id))
}

export function isStatementCurrent(
  statement: ConfirmedStatement,
  identity: FormalSnapshotIdentity,
): boolean {
  return (
    sameIdSet(statement.confirmedFactIds, identity.confirmedFactIds) &&
    sameIdSet(statement.confirmedTimelineEntryIds, identity.confirmedTimelineEntryIds) &&
    statement.ruleVersion === identity.ruleVersion
  )
}
