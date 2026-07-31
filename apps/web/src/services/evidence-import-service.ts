import type {
  EvidenceCategory,
  EvidenceFile,
  EvidenceMediaType,
  ImportOperationStage,
  M2ErrorCode,
  OperationJournalEntry,
  UuidV4,
  UtcTimestamp,
} from '@youju/domain'
import { EvidenceBlobStoreError, temporaryStoragePath } from '@youju/evidence-store'
import type { EvidenceBlobStore, StagedEvidenceBlob } from '@youju/evidence-store'
import { EvidenceImportError } from '../evidence/evidence-errors.js'
import { validateFileInput } from '../evidence/file-validation.js'
import type { EvidenceImportLimits } from '../evidence/file-validation.js'
import type { CaseRepository } from '../storage/index.js'

export type ImportEvidenceResult =
  | { readonly status: 'imported'; readonly evidence: EvidenceFile }
  | {
      readonly status: 'duplicate'
      readonly errorCode: 'duplicate_evidence'
      readonly existingEvidenceId: UuidV4
    }

export interface ImportEvidenceCommand {
  readonly caseId: UuidV4
  readonly evidenceId: UuidV4
  readonly operationId: UuidV4
  readonly file: File
  readonly category: EvidenceCategory
  readonly importedAt: UtcTimestamp
  readonly limits: EvidenceImportLimits
}

export interface EvidenceImportDependencies {
  readonly repository: CaseRepository
  readonly blobStore: EvidenceBlobStore
  readonly hashBlob: (blob: Blob) => Promise<string>
}

type EvidenceImportEntry = Extract<OperationJournalEntry, { operationType: 'evidence_import' }>

function chunkStream(file: File): AsyncIterable<Uint8Array> {
  return file.stream() as unknown as AsyncIterable<Uint8Array>
}

function toJournalErrorCode(error: unknown): M2ErrorCode | null {
  if (error instanceof EvidenceImportError) {
    switch (error.code) {
      case 'storage_quota_exceeded':
        return 'storage_quota_exceeded'
      case 'file_type_mismatch':
        return 'file_type_mismatch'
      case 'file_too_large':
        return 'file_too_large'
      case 'duplicate_evidence':
        return 'duplicate_evidence'
      default:
        return null
    }
  }
  if (error instanceof EvidenceBlobStoreError) {
    if (error.code === 'quota_exceeded') {
      return 'storage_quota_exceeded'
    }
    if (error.code === 'not_allowed') {
      return 'storage_not_supported'
    }
  }
  return null
}

export async function importEvidence(
  command: ImportEvidenceCommand,
  dependencies: EvidenceImportDependencies,
): Promise<ImportEvidenceResult> {
  const leadingBytes = new Uint8Array(await command.file.slice(0, 12).arrayBuffer())
  const validation = validateFileInput({
    fileName: command.file.name,
    mimeType: command.file.type,
    size: command.file.size,
    leadingBytes,
    limits: command.limits,
  })
  if (!validation.ok) {
    throw new EvidenceImportError(validation.errorCode, '文件校验未通过')
  }

  let stage: ImportOperationStage = 'validating'
  let temporaryStorageRef: string | null = null
  const baseEntry: Omit<EvidenceImportEntry, 'stage' | 'temporaryStorageRef'> = {
    operationId: command.operationId,
    caseId: command.caseId,
    evidenceId: command.evidenceId,
    operationType: 'evidence_import',
    startedAt: command.importedAt,
    errorCode: null,
  }

  try {
    await dependencies.repository.putOperation({
      ...baseEntry,
      stage,
      temporaryStorageRef,
    })

    stage = 'hashing'
    await dependencies.repository.putOperation({
      ...baseEntry,
      stage,
      temporaryStorageRef,
    })
    const sha256 = await dependencies.hashBlob(command.file)
    const existing = await dependencies.repository.findEvidenceByHash(command.caseId, sha256)
    if (existing !== null) {
      await dependencies.repository.putOperation({
        ...baseEntry,
        stage: 'failed',
        temporaryStorageRef,
        errorCode: 'duplicate_evidence',
      })
      await dependencies.repository.deleteOperation(command.operationId)
      return {
        status: 'duplicate',
        errorCode: 'duplicate_evidence',
        existingEvidenceId: existing.id,
      }
    }

    stage = 'writing'
    temporaryStorageRef = temporaryStoragePath(command.operationId)
    await dependencies.repository.putOperation({
      ...baseEntry,
      stage,
      temporaryStorageRef,
    })
    const staged: StagedEvidenceBlob = await dependencies.blobStore.stage(
      command.operationId,
      chunkStream(command.file),
    )

    stage = 'committing'
    temporaryStorageRef = staged.temporaryStorageRef
    await dependencies.repository.putOperation({
      ...baseEntry,
      stage,
      temporaryStorageRef,
    })
    const storageRef = await dependencies.blobStore.commit(
      staged,
      command.caseId,
      command.evidenceId,
    )

    const evidence: EvidenceFile = {
      id: command.evidenceId,
      caseId: command.caseId,
      originalName: command.file.name,
      mediaType: command.file.type as EvidenceMediaType,
      size: command.file.size,
      sha256,
      importedAt: command.importedAt,
      sourceCreatedAt: null,
      category: command.category,
      storageRef,
      isOriginalPreserved: true,
      metadata: {},
    }
    await dependencies.repository.addReadyEvidence(evidence, command.operationId)
    await dependencies.repository.deleteOperation(command.operationId)
    return { status: 'imported', evidence }
  } catch (error) {
    try {
      await dependencies.repository.putOperation({
        ...baseEntry,
        stage,
        temporaryStorageRef,
        errorCode: toJournalErrorCode(error),
      })
    } catch {
      // 启动恢复会清理残留操作记录
    }
    throw error
  }
}
