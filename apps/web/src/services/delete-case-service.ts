import type { UtcTimestamp, UuidV4 } from '@youju/domain'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import type { CaseRepository } from '../storage/index.js'

export type DeleteCaseResult =
  | { readonly status: 'deleted' }
  | {
      readonly status: 'failed'
      readonly code: 'delete_verification_failed'
      readonly remaining: readonly ('indexeddb' | 'opfs' | 'temporary')[]
    }

export interface DeleteCaseCommand {
  readonly caseId: UuidV4
  readonly operationId: UuidV4
  readonly expectedTitle: string
  readonly enteredTitle: string
  readonly startedAt: UtcTimestamp
}

export interface DeleteCaseDependencies {
  readonly repository: CaseRepository
  readonly blobStore: EvidenceBlobStore
}

async function verifyDeletion(
  caseId: UuidV4,
  operationId: UuidV4,
  storageRefs: readonly string[],
  dependencies: DeleteCaseDependencies,
): Promise<readonly ('indexeddb' | 'opfs' | 'temporary')[]> {
  const remaining: ('indexeddb' | 'opfs' | 'temporary')[] = []
  const { repository, blobStore } = dependencies

  const caseRecord = await repository.getCase(caseId)
  const evidence = await repository.listEvidence(caseId)
  const facts = await repository.listConfirmedFacts(caseId)
  const timeline = await repository.listTimeline(caseId)
  const statementDrafts = await repository.listStatementDrafts(caseId)
  const statements = await repository.listConfirmedStatements(caseId)
  const aiRecords = await repository.listAnalyses(caseId)
  const aiCandidates = await repository.listCandidates(caseId)
  const operations = (await repository.listOperations()).filter(
    (entry) => entry.operationId !== operationId,
  )
  if (
    caseRecord !== null ||
    evidence.length > 0 ||
    facts.length > 0 ||
    timeline.length > 0 ||
    statementDrafts.length > 0 ||
    statements.length > 0 || aiRecords.length > 0 || aiCandidates.length > 0
  ) {
    remaining.push('indexeddb')
  }
  if (operations.length > 0) {
    remaining.push('indexeddb')
    remaining.push('temporary')
  }
  for (const ref of storageRefs) {
    if (await blobStore.exists(ref)) {
      remaining.push('opfs')
      break
    }
  }
  if ((await blobStore.listCaseStorageRefs(caseId)).length > 0) {
    remaining.push('opfs')
  }
  return [...new Set(remaining)]
}

async function runCaseDeletion(
  operationId: UuidV4,
  caseId: UuidV4,
  startedAt: UtcTimestamp,
  dependencies: DeleteCaseDependencies,
): Promise<DeleteCaseResult> {
  const { repository, blobStore } = dependencies
  const baseEntry = {
    operationId,
    caseId,
    operationType: 'case_delete' as const,
    startedAt,
    errorCode: null,
  }
  await repository.putOperation({ ...baseEntry, stage: 'deleting' })
  const storageRefs = (await repository.listEvidence(caseId)).map((item) => item.storageRef)

  let phase: 'blobs' | 'records' = 'blobs'
  try {
    for (const ref of storageRefs) {
      await blobStore.delete(ref)
    }
    phase = 'records'
    await repository.deleteAllCaseRecords(caseId)
    await repository.putOperation({ ...baseEntry, stage: 'verifying' })
  } catch {
    return {
      status: 'failed',
      code: 'delete_verification_failed',
      remaining: phase === 'blobs' ? ['opfs'] : ['indexeddb', 'opfs'],
    }
  }

  const remaining = await verifyDeletion(caseId, operationId, storageRefs, dependencies)
  if (remaining.length > 0) {
    return { status: 'failed', code: 'delete_verification_failed', remaining }
  }
  await repository.deleteOperation(operationId)
  return { status: 'deleted' }
}

export async function deleteCasePermanently(
  command: DeleteCaseCommand,
  dependencies: DeleteCaseDependencies,
): Promise<DeleteCaseResult> {
  if (command.enteredTitle !== command.expectedTitle) {
    throw new Error('title_mismatch')
  }
  return runCaseDeletion(command.operationId, command.caseId, command.startedAt, dependencies)
}

export async function resumeCaseDeletion(
  operationId: UuidV4,
  caseId: UuidV4,
  startedAt: UtcTimestamp,
  dependencies: DeleteCaseDependencies,
): Promise<DeleteCaseResult> {
  return runCaseDeletion(operationId, caseId, startedAt, dependencies)
}
