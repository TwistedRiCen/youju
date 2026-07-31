export interface EvidenceImportLimits {
  readonly currentFileCount: number
  readonly currentTotalBytes: number
  readonly remainingQuotaBytes: number | null
}

export type FileValidationErrorCode =
  | 'file_count_exceeded'
  | 'file_too_large'
  | 'total_size_exceeded'
  | 'storage_quota_exceeded'
  | 'file_type_mismatch'

export const MAX_FILES_PER_CASE = 50
export const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024

type SignatureKind = 'jpeg' | 'png' | 'webp' | 'pdf'

const SIGNATURE_BYTES: Readonly<Record<SignatureKind, readonly number[]>> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  webp: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d],
}

function matchKind(fileName: string, mimeType: string): SignatureKind | null {
  const extension = fileName.toLowerCase().split('.').at(-1) ?? ''
  if ((extension === 'jpg' || extension === 'jpeg') && mimeType === 'image/jpeg') {
    return 'jpeg'
  }
  if (extension === 'png' && mimeType === 'image/png') {
    return 'png'
  }
  if (extension === 'webp' && mimeType === 'image/webp') {
    return 'webp'
  }
  if (extension === 'pdf' && mimeType === 'application/pdf') {
    return 'pdf'
  }
  return null
}

function hasSignature(kind: SignatureKind, leadingBytes: Uint8Array): boolean {
  const signature = SIGNATURE_BYTES[kind]
  if (signature === undefined || leadingBytes.length < signature.length) {
    return false
  }
  return signature.every((byte, index) => leadingBytes[index] === byte)
}

export interface FileInput {
  readonly fileName: string
  readonly mimeType: string
  readonly size: number
  readonly leadingBytes: Uint8Array
  readonly limits: EvidenceImportLimits
}

export type FileValidationResult = { readonly ok: true } | {
  readonly ok: false
  readonly errorCode: FileValidationErrorCode
}

export function validateFileInput(input: FileInput): FileValidationResult {
  if (input.limits.currentFileCount >= MAX_FILES_PER_CASE) {
    return { ok: false, errorCode: 'file_count_exceeded' }
  }
  if (input.size > MAX_SINGLE_FILE_BYTES) {
    return { ok: false, errorCode: 'file_too_large' }
  }
  if (input.limits.currentTotalBytes + input.size > MAX_TOTAL_BYTES) {
    return { ok: false, errorCode: 'total_size_exceeded' }
  }
  if (
    input.limits.remainingQuotaBytes !== null &&
    input.size > input.limits.remainingQuotaBytes
  ) {
    return { ok: false, errorCode: 'storage_quota_exceeded' }
  }
  const kind = matchKind(input.fileName, input.mimeType)
  if (kind === null || !hasSignature(kind, input.leadingBytes)) {
    return { ok: false, errorCode: 'file_type_mismatch' }
  }
  return { ok: true }
}
