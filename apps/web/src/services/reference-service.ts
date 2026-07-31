import type { UuidV4 } from '@youju/domain'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import type { CaseRepository } from '../storage/index.js'

export interface EvidenceReference {
  readonly type: 'confirmed_fact' | 'timeline_entry'
  readonly id: UuidV4
}

export async function findEvidenceReferences(
  caseId: UuidV4,
  evidenceId: UuidV4,
  repository: CaseRepository,
): Promise<readonly EvidenceReference[]> {
  const references: EvidenceReference[] = []
  for (const fact of await repository.listConfirmedFacts(caseId)) {
    if (fact.sourceRefs.some((source) => source.evidenceId === evidenceId)) {
      references.push({ type: 'confirmed_fact', id: fact.id })
    }
  }
  for (const entry of await repository.listTimeline(caseId)) {
    if (entry.sourceRefs.some((source) => source.evidenceId === evidenceId)) {
      references.push({ type: 'timeline_entry', id: entry.id })
    }
  }
  return references
}

export class EvidenceReferencedError extends Error {
  readonly code = 'evidence_is_referenced' as const
  readonly references: readonly EvidenceReference[]

  constructor(references: readonly EvidenceReference[]) {
    super('该材料被正式内容引用，不能删除')
    this.name = 'EvidenceReferencedError'
    this.references = references
  }
}

export async function deleteEvidence(
  caseId: UuidV4,
  evidenceId: UuidV4,
  repository: CaseRepository,
  blobStore: EvidenceBlobStore,
): Promise<void> {
  const references = await findEvidenceReferences(caseId, evidenceId, repository)
  if (references.length > 0) {
    throw new EvidenceReferencedError(references)
  }
  const metadata = (await repository.listEvidence(caseId)).find(
    (item) => item.id === evidenceId,
  )
  if (metadata === undefined) {
    return
  }
  const operationId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  await repository.putOperation({
    operationId,
    caseId,
    evidenceId,
    storageRef: metadata.storageRef,
    operationType: 'evidence_delete',
    stage: 'deleting',
    startedAt,
    errorCode: null,
  })
  try {
    await blobStore.delete(metadata.storageRef)
    await repository.removeEvidence(evidenceId)
    await repository.putOperation({
      operationId,
      caseId,
      evidenceId,
      storageRef: metadata.storageRef,
      operationType: 'evidence_delete',
      stage: 'verifying',
      startedAt,
      errorCode: null,
    })
    const blobGone = !(await blobStore.exists(metadata.storageRef))
    const metadataGone =
      (await repository.listEvidence(caseId)).find((item) => item.id === evidenceId) ===
      undefined
    if (!blobGone || !metadataGone) {
      throw new Error('delete_verification_failed')
    }
    await repository.deleteOperation(operationId)
  } catch (error) {
    await repository
      .putOperation({
        operationId,
        caseId,
        evidenceId,
        storageRef: metadata.storageRef,
        operationType: 'evidence_delete',
        stage: 'deleting',
        startedAt,
        errorCode: null,
      })
      .catch(() => undefined)
    throw error
  }
}
