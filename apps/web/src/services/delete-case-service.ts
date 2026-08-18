import type { CaseEvent, OperationJournalEntry, UtcTimestamp, UuidV4 } from '@youju/domain'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import { evidenceStoragePath } from '@youju/evidence-store'
import type { CaseRepository } from '../storage/index.js'
import type { AppPreferencesRepository } from '../storage/index.js'

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

export interface DeleteAllLocalDataDependencies extends DeleteCaseDependencies {
  readonly preferences: AppPreferencesRepository
}

export type DeleteAllLocalDataResult =
  | { readonly status: 'deleted' }
  | {
      readonly status: 'failed'
      readonly code: 'delete_verification_failed'
      readonly remaining: readonly ('indexeddb' | 'opfs' | 'temporary' | 'preferences')[]
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
    (entry) => entry.operationId !== operationId && entry.caseId === caseId,
  )
  if (
    caseRecord !== null ||
    evidence.length > 0 ||
    facts.length > 0 ||
    timeline.length > 0 ||
    statementDrafts.length > 0 ||
    statements.length > 0 ||
    aiRecords.length > 0 ||
    aiCandidates.length > 0
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

export async function deleteDemoCasePermanently(
  caseEvent: CaseEvent,
  fixtureId: string,
  dependencies: DeleteCaseDependencies,
): Promise<DeleteCaseResult> {
  if (
    caseEvent.dataOrigin !== 'fictional_demo' ||
    caseEvent.demoFixtureId !== fixtureId
  ) {
    throw new Error('demo_identity_mismatch')
  }
  return runCaseDeletion(
    crypto.randomUUID(),
    caseEvent.id,
    new Date().toISOString(),
    dependencies,
  )
}

export async function cleanupInterruptedDemoCaseLoad(
  entry: Extract<OperationJournalEntry, { operationType: 'demo_case_load' }>,
  dependencies: DeleteCaseDependencies,
): Promise<'cleaned' | 'protected' | 'incomplete'> {
  await dependencies.blobStore.deleteTemporary(entry.operationId)
  const stored = await dependencies.repository.getCase(entry.caseId)
  if (stored !== null) {
    if (
      stored.caseEvent.dataOrigin !== 'fictional_demo' ||
      stored.caseEvent.demoFixtureId !== entry.demoFixtureId
    ) {
      await dependencies.repository.deleteOperation(entry.operationId)
      return 'protected'
    }
    await dependencies.blobStore.deleteCase(entry.caseId)
    await dependencies.repository.deleteAllCaseRecords(entry.caseId)
  } else {
    await dependencies.blobStore.deleteCase(entry.caseId)
  }

  const recordsGone = (await dependencies.repository.getCase(entry.caseId)) === null
  const blobsGone = (await dependencies.blobStore.listCaseStorageRefs(entry.caseId)).length === 0
  if (recordsGone && blobsGone) {
    await dependencies.repository.deleteOperation(entry.operationId)
    return 'cleaned'
  }
  return 'incomplete'
}

export async function deleteAllLocalData(
  dependencies: DeleteAllLocalDataDependencies,
): Promise<DeleteAllLocalDataResult> {
  const interruptedOperations = await dependencies.repository.listOperations()
  try {
    for (const entry of interruptedOperations) {
      await dependencies.blobStore.deleteTemporary(entry.operationId)
      if (entry.operationType === 'evidence_delete') {
        await dependencies.blobStore.delete(entry.storageRef)
      }
      if (entry.operationType === 'evidence_import') {
        await dependencies.blobStore.delete(evidenceStoragePath(entry.caseId, entry.evidenceId))
      }
      await dependencies.repository.deleteOperation(entry.operationId)
    }
  } catch {
    return {
      status: 'failed',
      code: 'delete_verification_failed',
      remaining: ['temporary'],
    }
  }

  const cases = await dependencies.repository.listCases()
  for (const storedCase of cases) {
    const result = await runCaseDeletion(
      crypto.randomUUID(),
      storedCase.caseEvent.id,
      new Date().toISOString(),
      dependencies,
    )
    if (result.status === 'failed') {
      return result
    }
  }

  try {
    await dependencies.preferences.clear()
  } catch {
    return {
      status: 'failed',
      code: 'delete_verification_failed',
      remaining: ['preferences'],
    }
  }

  const remaining: ('indexeddb' | 'temporary' | 'preferences')[] = []
  if ((await dependencies.repository.listCases()).length > 0) {
    remaining.push('indexeddb')
  }
  if ((await dependencies.repository.listOperations()).length > 0) {
    remaining.push('indexeddb', 'temporary')
  }
  if ((await dependencies.preferences.get()) !== null) {
    remaining.push('preferences')
  }
  return remaining.length === 0
    ? { status: 'deleted' }
    : { status: 'failed', code: 'delete_verification_failed', remaining }
}
