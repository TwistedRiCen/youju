import { describe, expect, it } from 'vitest'
import { evidenceStoragePath, temporaryStoragePath } from '../src/index.js'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'

describe('OPFS path construction', () => {
  it('builds the exact evidence storage path', () => {
    expect(evidenceStoragePath(caseId, evidenceId)).toBe(
      `cases/${caseId}/evidence/${evidenceId}`,
    )
  })

  it('builds the exact temporary storage path', () => {
    expect(temporaryStoragePath(operationId)).toBe(`temporary/${operationId}`)
  })

  it('rejects non-UUID identifiers', () => {
    expect(() => evidenceStoragePath('../case', evidenceId)).toThrow('invalid_uuid')
    expect(() => temporaryStoragePath('not-a-uuid')).toThrow('invalid_uuid')
    expect(() => evidenceStoragePath(caseId, 'CASE-ID')).toThrow('invalid_uuid')
  })
})
