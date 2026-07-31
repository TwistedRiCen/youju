import type { UuidV4 } from '@youju/domain'

const UUID_V4_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'

function assertUuid(value: string, label: string): void {
  if (!new RegExp(UUID_V4_PATTERN).test(value)) {
    throw new Error(`invalid_uuid:${label}`)
  }
}

export function evidenceStoragePath(caseId: UuidV4, evidenceId: UuidV4): string {
  assertUuid(caseId, 'caseId')
  assertUuid(evidenceId, 'evidenceId')
  return `cases/${caseId}/evidence/${evidenceId}`
}

export function temporaryStoragePath(operationId: UuidV4): string {
  assertUuid(operationId, 'operationId')
  return `temporary/${operationId}`
}
