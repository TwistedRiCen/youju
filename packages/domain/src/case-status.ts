import type { CaseStatus } from './schemas.js'

export interface DeriveCaseStatusInput {
  readonly hasFormalContent: boolean
  readonly currentPreflightReady: boolean
  readonly currentSnapshotExported: boolean
}

export function deriveCaseStatus(input: DeriveCaseStatusInput): CaseStatus {
  if (!input.hasFormalContent) {
    return 'draft'
  }
  if (!input.currentPreflightReady) {
    return 'in_progress'
  }
  return input.currentSnapshotExported ? 'exported' : 'ready_to_export'
}
