import { evidenceStoragePath } from '@youju/evidence-store'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import type { CaseRepository } from '../storage/index.js'
import { resumeCaseDeletion } from './delete-case-service.js'

export interface LocalOperationRecoveryDependencies {
  readonly repository: CaseRepository
  readonly blobStore: EvidenceBlobStore
}

export async function recoverLocalOperations(
  dependencies: LocalOperationRecoveryDependencies,
): Promise<readonly string[]> {
  const cleaned: string[] = []
  const entries = await dependencies.repository.listOperations()

  for (const entry of entries) {
    if (entry.operationType === 'evidence_delete') {
      const metadata = (await dependencies.repository.listEvidence(entry.caseId)).find(
        (item) => item.id === entry.evidenceId,
      )
      await dependencies.blobStore.delete(entry.storageRef).catch(() => undefined)
      if (metadata !== undefined) {
        await dependencies.repository.removeEvidence(entry.evidenceId)
      }
      const blobGone = !(await dependencies.blobStore.exists(entry.storageRef))
      const metadataGone =
        (await dependencies.repository.listEvidence(entry.caseId)).find(
          (item) => item.id === entry.evidenceId,
        ) === undefined
      if (blobGone && metadataGone) {
        await dependencies.repository.deleteOperation(entry.operationId)
      }
      cleaned.push(entry.operationId)
      continue
    }
    if (entry.operationType === 'case_delete') {
      const result = await resumeCaseDeletion(
        entry.operationId,
        entry.caseId,
        entry.startedAt,
        dependencies,
      )
      if (result.status === 'deleted') {
        cleaned.push(entry.operationId)
      }
      continue
    }
    if (entry.operationType === 'package_export') {
      await dependencies.blobStore.deleteTemporary(entry.operationId)
      await dependencies.repository.deleteOperation(entry.operationId)
      cleaned.push(entry.operationId)
      continue
    }
    if (entry.operationType !== 'evidence_import') {
      continue
    }
    if (entry.stage === 'validating' || entry.stage === 'hashing') {
      await dependencies.repository.deleteOperation(entry.operationId)
      cleaned.push(entry.operationId)
      continue
    }
    if (entry.stage === 'writing' || entry.stage === 'failed') {
      await dependencies.blobStore.deleteTemporary(entry.operationId)
      await dependencies.repository.deleteOperation(entry.operationId)
      cleaned.push(entry.operationId)
      continue
    }
    if (entry.stage === 'committing') {
      const metadata = (
        await dependencies.repository.listEvidence(entry.caseId)
      ).find((evidence) => evidence.id === entry.evidenceId)
      const finalPath = evidenceStoragePath(entry.caseId, entry.evidenceId)
      const finalExists = await dependencies.blobStore.exists(finalPath)

      if (metadata !== undefined && finalExists) {
        await dependencies.blobStore.deleteTemporary(entry.operationId)
        await dependencies.repository.deleteOperation(entry.operationId)
      } else {
        if (finalExists) {
          await dependencies.blobStore.delete(finalPath)
        }
        await dependencies.blobStore.deleteTemporary(entry.operationId)
        if (metadata !== undefined) {
          await dependencies.repository.removeEvidence(entry.evidenceId)
        }
        await dependencies.repository.deleteOperation(entry.operationId)
      }
      cleaned.push(entry.operationId)
    }
  }

  return cleaned
}
