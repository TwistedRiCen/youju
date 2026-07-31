import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'

interface BrowserBytes {
  readonly length: number
  readonly [index: number]: number
}

interface BrowserBlobStore {
  stage(
    operationId: string,
    chunks: readonly BrowserBytes[],
  ): Promise<{ operationId: string; temporaryStorageRef: string; size: number }>
  commit(
    staged: { operationId: string; temporaryStorageRef: string; size: number },
    caseId: string,
    evidenceId: string,
  ): Promise<string>
  read(storageRef: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>
  exists(storageRef: string): Promise<boolean>
  deleteTemporary(operationId: string): Promise<void>
}

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'
const pngByteValues = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x01, 0x02, 0x03,
]
const expectedHash = createHash('sha256').update(Buffer.from(pngByteValues)).digest('hex')

test('imports evidence, deduplicates by hash, and recovers interrupted imports', async ({
  page,
}) => {
  await page.goto('/')

  const payload = {
    caseId,
    evidenceId,
    operationId,
    pngByteValues,
    expectedHash,
  }
  const result = await page.evaluate(async (evaluatePayload) => {
    const storageUrl = '/src/storage/index.ts'
    const storageModule = (await import(storageUrl)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        createCase(
          caseEvent: Record<string, unknown>,
          drafts: readonly unknown[],
          writerId: string,
        ): Promise<unknown>
        listEvidence(caseId: string): Promise<
          readonly { id: string; sha256: string; storageRef: string; size: number }[]
        >
        putOperation(entry: Record<string, unknown>): Promise<void>
        listOperations(): Promise<readonly { operationId: string; stage: string }[]>
        deleteOperation(operationId: string): Promise<void>
      }
    }
    const evidenceStoreUrl = '/node_modules/@youju/evidence-store/src/index.ts'
    const evidenceStoreModule = (await import(evidenceStoreUrl)) as {
      OpfsEvidenceBlobStore: new () => BrowserBlobStore
    }
    const hashUrl = '/node_modules/@youju/evidence-hash/src/index.ts'
    const hashModule = (await import(hashUrl)) as {
      sha256Blob: (blob: Blob) => Promise<string>
    }
    const importServiceUrl = '/src/services/evidence-import-service.ts'
    const importModule = (await import(importServiceUrl)) as {
      importEvidence: (
        command: Record<string, unknown>,
        dependencies: Record<string, unknown>,
      ) => Promise<{ status: string; evidence?: Record<string, unknown>; existingEvidenceId?: string }>
    }
    const recoveryUrl = '/src/services/recover-local-operations.ts'
    const recoveryModule = (await import(recoveryUrl)) as {
      recoverLocalOperations: (dependencies: Record<string, unknown>) => Promise<readonly string[]>
    }

    const database = await storageModule.openYoujuDatabase(storageModule.DATABASE_MIGRATIONS)
    const repository = new storageModule.IndexedDbCaseRepository(database)
    const blobStore = new evidenceStoreModule.OpfsEvidenceBlobStore()
    const fileBytes = new Uint8Array(evaluatePayload.pngByteValues)

    await repository.createCase(
      {
        id: evaluatePayload.caseId,
        scenarioType: 'ecommerce_refund',
        title: '导入测试',
        createdAt: '2026-07-31T06:00:00.000Z',
        updatedAt: '2026-07-31T06:00:00.000Z',
        status: 'draft',
        requestedResolution: null,
        storageMode: 'local',
        schemaVersion: 1,
      },
      [],
      'writer',
    )

    const file = new File([fileBytes as unknown as BlobPart], 'evidence.png', {
      type: 'image/png',
    })
    const first = await importModule.importEvidence(
      {
        caseId: evaluatePayload.caseId,
        evidenceId: evaluatePayload.evidenceId,
        operationId: evaluatePayload.operationId,
        file,
        category: 'product_issue_photo',
        importedAt: '2026-07-31T06:01:00.000Z',
        limits: { currentFileCount: 0, currentTotalBytes: 0, remainingQuotaBytes: null },
      },
      { repository, blobStore, hashBlob: (blob: Blob) => hashModule.sha256Blob(blob) },
    )

    const evidenceList = await repository.listEvidence(evaluatePayload.caseId)
    const imported = evidenceList[0]
    const storedBlob = imported === undefined ? null : await blobStore.read(imported.storageRef)
    const storedBytes =
      storedBlob === null
        ? null
        : Array.from(new Uint8Array(await storedBlob.arrayBuffer()))

    const second = await importModule.importEvidence(
      {
        caseId: evaluatePayload.caseId,
        evidenceId: '00000000-0000-4000-8000-000000000102',
        operationId: '00000000-0000-4000-8000-000000000702',
        file,
        category: 'product_issue_photo',
        importedAt: '2026-07-31T06:02:00.000Z',
        limits: { currentFileCount: 1, currentTotalBytes: imported?.size ?? 0, remainingQuotaBytes: null },
      },
      { repository, blobStore, hashBlob: (blob: Blob) => hashModule.sha256Blob(blob) },
    )

    const interruptedOperationId = '00000000-0000-4000-8000-000000000703'
    const staged = await blobStore.stage(interruptedOperationId, [
      new Uint8Array([9, 9, 9]) as unknown as BrowserBytes,
    ])
    await repository.putOperation({
      operationId: interruptedOperationId,
      caseId: evaluatePayload.caseId,
      evidenceId: '00000000-0000-4000-8000-000000000103',
      operationType: 'evidence_import',
      stage: 'writing',
      temporaryStorageRef: staged.temporaryStorageRef,
      startedAt: '2026-07-31T06:03:00.000Z',
      errorCode: null,
    })
    const cleaned = await recoveryModule.recoverLocalOperations({ repository, blobStore })
    const operationsAfter = await repository.listOperations()
    const tempAfter = await blobStore.exists(staged.temporaryStorageRef)

    const bytesEqual =
      storedBytes !== null &&
      storedBytes.length === evaluatePayload.pngByteValues.length &&
      storedBytes.every((value, index) => value === evaluatePayload.pngByteValues[index])

    return {
      firstStatus: first.status,
      evidenceCount: evidenceList.length,
      storedSha256: imported?.sha256 ?? null,
      expectedHash: evaluatePayload.expectedHash,
      bytesEqual,
      secondStatus: second.status,
      duplicateId: second.existingEvidenceId ?? null,
      cleaned,
      operationsAfter: operationsAfter.length,
      tempAfter,
    }
  }, payload)

  expect(result).toEqual({
    firstStatus: 'imported',
    evidenceCount: 1,
    storedSha256: expectedHash,
    expectedHash,
    bytesEqual: true,
    secondStatus: 'duplicate',
    duplicateId: evidenceId,
    cleaned: ['00000000-0000-4000-8000-000000000703'],
    operationsAfter: 0,
    tempAfter: false,
  })
})
