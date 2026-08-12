import { describe, expect, it, vi } from 'vitest'
import { importEvidence } from '../src/services/evidence-import-service.js'
import type { CaseRepository } from '../src/storage/index.js'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import type { EvidenceFile } from '@youju/domain'

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'
const fixedHash = 'a'.repeat(64)

function createFakeDependencies() {
  const events: string[] = []
  const repository = {
    putOperation: vi.fn(async (entry: { stage: string }) => {
      events.push(`journal:${entry.stage}`)
    }),
    deleteOperation: vi.fn(async () => {
      events.push('journal:remove')
    }),
    findEvidenceByHash: vi.fn(async (): Promise<EvidenceFile | null> => null),
    addReadyEvidence: vi.fn(async () => {
      events.push('repository:add-ready-evidence')
    }),
  }
  const blobStore = {
    stage: vi.fn(async () => {
      events.push('blob:stage')
      return { operationId, temporaryStorageRef: `temporary/${operationId}`, size: 12 }
    }),
    commit: vi.fn(async () => {
      events.push('blob:commit')
      return `cases/${caseId}/evidence/${evidenceId}`
    }),
  }

  return {
    events,
    repository: repository as unknown as CaseRepository,
    blobStore: blobStore as unknown as EvidenceBlobStore,
    fakes: { repository, blobStore },
  }
}

function validPngFile(): File {
  return new File(
    [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04])],
    'photo.png',
    { type: 'image/png' },
  )
}

describe('evidence import orchestration', () => {
  it('follows the exact stage, commit and journal order', async () => {
    const { events, repository, blobStore, fakes } = createFakeDependencies()

    const result = await importEvidence(
      {
        caseId,
        evidenceId,
        operationId,
        file: validPngFile(),
        category: 'product_issue_photo',
        importedAt: '2026-07-31T06:00:00.000Z',
        limits: { currentFileCount: 0, currentTotalBytes: 0, remainingQuotaBytes: null },
      },
      {
        repository,
        blobStore,
        hashBlob: async () => fixedHash,
      },
    )

    expect(result).toMatchObject({ status: 'imported' })
    expect(events).toEqual([
      'journal:validating',
      'journal:hashing',
      'journal:writing',
      'blob:stage',
      'journal:committing',
      'blob:commit',
      'repository:add-ready-evidence',
      'journal:remove',
    ])
    expect(fakes.blobStore.stage).toHaveBeenCalledWith(operationId, expect.anything())
  })

  it('returns the existing evidence for a same-case duplicate', async () => {
    const { events, repository, blobStore, fakes } = createFakeDependencies()
    fakes.repository.findEvidenceByHash.mockResolvedValue({
      id: evidenceId,
      caseId,
      originalName: 'photo.png',
      mediaType: 'image/png',
      size: 12,
      sha256: fixedHash,
      importedAt: '2026-07-31T06:00:00.000Z',
      sourceCreatedAt: null,
      category: 'product_issue_photo',
      categoryOrigin: 'manual',
      categoryCandidateId: null,
      storageRef: `cases/${caseId}/evidence/${evidenceId}`,
      isOriginalPreserved: true,
      metadata: {},
    })

    const result = await importEvidence(
      {
        caseId,
        evidenceId: '00000000-0000-4000-8000-000000000102',
        operationId: '00000000-0000-4000-8000-000000000702',
        file: validPngFile(),
        category: 'product_issue_photo',
        importedAt: '2026-07-31T06:00:00.000Z',
        limits: { currentFileCount: 0, currentTotalBytes: 0, remainingQuotaBytes: null },
      },
      {
        repository,
        blobStore,
        hashBlob: async () => fixedHash,
      },
    )

    expect(result).toEqual({
      status: 'duplicate',
      errorCode: 'duplicate_evidence',
      existingEvidenceId: evidenceId,
    })
    expect(events).toEqual([
      'journal:validating',
      'journal:hashing',
      'journal:failed',
      'journal:remove',
    ])
    expect(fakes.blobStore.stage).not.toHaveBeenCalled()
  })

  it('rejects invalid files before creating a journal entry', async () => {
    const { events, repository, blobStore, fakes } = createFakeDependencies()
    const file = new File([Uint8Array.from([0x00, 0x01, 0x02])], 'photo.exe', {
      type: 'application/pdf',
    })

    await expect(
      importEvidence(
        {
          caseId,
          evidenceId,
          operationId,
          file,
          category: 'product_issue_photo',
          importedAt: '2026-07-31T06:00:00.000Z',
          limits: { currentFileCount: 0, currentTotalBytes: 0, remainingQuotaBytes: null },
        },
        {
          repository,
          blobStore,
          hashBlob: async () => fixedHash,
        },
      ),
    ).rejects.toMatchObject({ name: 'EvidenceImportError', code: 'file_type_mismatch' })
    expect(events).toEqual([])
    expect(fakes.repository.putOperation).not.toHaveBeenCalled()
  })
})
