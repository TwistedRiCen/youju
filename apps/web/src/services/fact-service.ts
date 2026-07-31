import type { ConfirmFactCommand, ConfirmedFact, FactDraft, UuidV4 } from '@youju/domain'
import { getCaseRepository, saveCaseDrafts } from './case-service.js'

export interface FactsSnapshot {
  readonly drafts: readonly FactDraft[]
  readonly currentFacts: readonly ConfirmedFact[]
  readonly revision: number
}

export async function loadFacts(caseId: UuidV4): Promise<FactsSnapshot> {
  const repository = await getCaseRepository()
  const aggregate = await repository.getCase(caseId)
  if (aggregate === null) {
    return { drafts: [], currentFacts: [], revision: 0 }
  }
  return {
    drafts: aggregate.factDrafts,
    currentFacts: await repository.listConfirmedFacts(caseId),
    revision: aggregate.revision,
  }
}

export async function saveFactDrafts(
  caseId: UuidV4,
  expectedRevision: number,
  drafts: readonly FactDraft[],
): Promise<number> {
  const repository = await getCaseRepository()
  return saveCaseDrafts(repository, caseId, expectedRevision, drafts)
}

export async function listConfirmedFacts(caseId: UuidV4): Promise<readonly ConfirmedFact[]> {
  const repository = await getCaseRepository()
  return repository.listConfirmedFacts(caseId)
}

export async function confirmFactDraft(
  command: ConfirmFactCommand,
): Promise<ConfirmedFact> {
  const repository = await getCaseRepository()
  return repository.confirmFact(command)
}
