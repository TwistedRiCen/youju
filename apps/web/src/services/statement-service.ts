import type { UuidV4 } from '@youju/domain'
import type { ConfirmedStatement, StatementDraft } from '@youju/domain'
import {
  buildStatementDraft,
  confirmStatement,
  isStatementCurrent,
  selectCurrentConfirmedFacts,
} from '@youju/domain'
import type { FormalSnapshotIdentity } from '@youju/domain'
import { evaluateRule } from '@youju/rule-engine'
import type { RuleFinding } from '@youju/rule-engine'
import type { CaseRepository } from '../storage/index.js'
import { getCaseRepository } from './case-service.js'
import { loadEcommerceRefundRule } from './load-ecommerce-rule.js'

export interface FindingsSnapshot {
  readonly findings: readonly RuleFinding[]
  readonly ruleVersion: string
}

export async function loadFindings(caseId: UuidV4): Promise<FindingsSnapshot> {
  const repository = await getCaseRepository()
  const rule = loadEcommerceRefundRule()
  const findings = evaluateRule(rule, {
    confirmedFactFields: selectCurrentConfirmedFacts(
      await repository.listConfirmedFacts(caseId),
    ).map((fact) => fact.fieldName),
    evidence: (await repository.listEvidence(caseId)).map((item) => ({
      id: item.id,
      category: item.category,
    })),
  })
  return { findings, ruleVersion: rule.version }
}

async function snapshotIdentity(
  caseId: UuidV4,
  repository: CaseRepository,
): Promise<FormalSnapshotIdentity | null> {
  const caseRecord = await repository.getCase(caseId)
  if (caseRecord === null) {
    return null
  }
  const currentFacts = selectCurrentConfirmedFacts(
    await repository.listConfirmedFacts(caseId),
  )
  const confirmedTimeline = (await repository.listTimeline(caseId)).filter(
    (entry) => entry.status === 'confirmed',
  )
  return {
    confirmedFactIds: currentFacts.map((fact) => fact.id),
    confirmedTimelineEntryIds: confirmedTimeline.map((entry) => entry.id),
    ruleVersion: loadEcommerceRefundRule().version,
  }
}

export interface StatementSnapshot {
  readonly draft: StatementDraft | null
  readonly latestConfirmed: ConfirmedStatement | null
  readonly isCurrent: boolean
}

export async function loadStatement(caseId: UuidV4): Promise<StatementSnapshot> {
  const repository = await getCaseRepository()
  const drafts = await repository.listStatementDrafts(caseId)
  const confirmed = await repository.listConfirmedStatements(caseId)
  const latestConfirmed = confirmed.at(-1) ?? null
  const identity = await snapshotIdentity(caseId, repository)
  return {
    draft: drafts.at(-1) ?? null,
    latestConfirmed,
    isCurrent:
      latestConfirmed !== null && identity !== null && isStatementCurrent(latestConfirmed, identity),
  }
}

export async function generateStatementDraft(caseId: UuidV4): Promise<StatementDraft> {
  const repository = await getCaseRepository()
  const caseRecord = await repository.getCase(caseId)
  if (caseRecord === null) {
    throw new Error('case_not_found')
  }
  const currentFacts = selectCurrentConfirmedFacts(
    await repository.listConfirmedFacts(caseId),
  )
  const confirmedTimeline = (await repository.listTimeline(caseId)).filter(
    (entry) => entry.status === 'confirmed',
  )
  const { findings, ruleVersion } = await loadFindings(caseId)
  const draft = buildStatementDraft({
    caseEvent: caseRecord.caseEvent,
    confirmedFacts: currentFacts,
    confirmedTimeline,
    findings,
    ruleVersion,
    updatedAt: new Date().toISOString(),
    revision: caseRecord.revision,
  })
  await repository.putStatementDraft(draft)
  return draft
}

export async function confirmLatestStatement(caseId: UuidV4): Promise<ConfirmedStatement> {
  const repository = await getCaseRepository()
  const drafts = await repository.listStatementDrafts(caseId)
  const draft = drafts.at(-1)
  if (draft === undefined) {
    throw new Error('no_statement_draft')
  }
  const confirmed = await repository.listConfirmedStatements(caseId)
  const nextVersion = confirmed.length === 0 ? 1 : (confirmed.at(-1)?.version ?? 0) + 1
  const statement = confirmStatement({
    draft,
    id: crypto.randomUUID(),
    confirmedAt: new Date().toISOString(),
    version: nextVersion,
  })
  await repository.appendConfirmedStatement(statement)
  return statement
}

export async function updateStatementDraft(
  caseId: UuidV4,
  content: string,
): Promise<void> {
  const repository = await getCaseRepository()
  const drafts = await repository.listStatementDrafts(caseId)
  const latest = drafts.at(-1)
  if (latest === undefined) {
    throw new Error('no_statement_draft')
  }
  await repository.putStatementDraft({
    ...latest,
    content,
    updatedAt: new Date().toISOString(),
  })
}
