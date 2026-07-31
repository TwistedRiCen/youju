import type { UuidV4 } from '@youju/domain'

export interface StagedEvidenceBlob {
  readonly operationId: UuidV4
  readonly temporaryStorageRef: string
  readonly size: number
}

export type EvidenceBlobStoreErrorCode =
  | 'not_allowed'
  | 'quota_exceeded'
  | 'storage_unavailable'

export class EvidenceBlobStoreError extends Error {
  readonly code: EvidenceBlobStoreErrorCode

  constructor(code: EvidenceBlobStoreErrorCode, message: string) {
    super(message)
    this.name = 'EvidenceBlobStoreError'
    this.code = code
  }
}

export interface EvidenceBlobStore {
  stage(operationId: UuidV4, chunks: AsyncIterable<Uint8Array>): Promise<StagedEvidenceBlob>
  commit(staged: StagedEvidenceBlob, caseId: UuidV4, evidenceId: UuidV4): Promise<string>
  read(storageRef: string): Promise<Blob>
  exists(storageRef: string): Promise<boolean>
  delete(storageRef: string): Promise<void>
  deleteTemporary(operationId: UuidV4): Promise<void>
  listCaseStorageRefs(caseId: UuidV4): Promise<readonly string[]>
  deleteCase(caseId: UuidV4): Promise<void>
}
