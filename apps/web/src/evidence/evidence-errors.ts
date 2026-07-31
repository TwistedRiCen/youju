export type EvidenceImportErrorCode =
  | 'file_count_exceeded'
  | 'file_too_large'
  | 'total_size_exceeded'
  | 'storage_quota_exceeded'
  | 'file_type_mismatch'
  | 'duplicate_evidence'
  | 'hash_mismatch'
  | 'storage_unavailable'

export class EvidenceImportError extends Error {
  readonly code: EvidenceImportErrorCode

  constructor(code: EvidenceImportErrorCode, message: string) {
    super(message)
    this.name = 'EvidenceImportError'
    this.code = code
  }
}
