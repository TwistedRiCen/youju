import { expect, test } from '@playwright/test'

interface BrowserBytes {
  readonly length: number
  readonly [index: number]: number
}

interface BrowserBlobStore {
  stage(
    operationId: string,
    chunks: readonly BrowserBytes[],
  ): Promise<{
    operationId: string
    temporaryStorageRef: string
    size: number
  }>
  commit(
    staged: { operationId: string; temporaryStorageRef: string; size: number },
    caseId: string,
    evidenceId: string,
  ): Promise<string>
  read(storageRef: string): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>
  exists(storageRef: string): Promise<boolean>
  delete(storageRef: string): Promise<void>
  deleteTemporary(operationId: string): Promise<void>
  listCaseStorageRefs(caseId: string): Promise<readonly string[]>
  deleteCase(caseId: string): Promise<void>
}

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'
const chunks: readonly BrowserBytes[] = [
  new Uint8Array([1, 2, 3]),
  new Uint8Array([4, 5]),
  new Uint8Array([6]),
]
const expectedBytes: BrowserBytes = new Uint8Array([1, 2, 3, 4, 5, 6])

test('stages, commits, persists, and verifies deletion of OPFS blobs', async ({ page }) => {
  await page.goto('/')

  const payload = {
    caseId,
    evidenceId,
    operationId,
    chunks,
    expected: expectedBytes,
  }
  const result = await page.evaluate(
    async (evaluatePayload) => {
      const moduleUrl = '/node_modules/@youju/evidence-store/src/index.ts'
      const storeModule = (await import(moduleUrl)) as {
        OpfsEvidenceBlobStore: new () => BrowserBlobStore
      }
      const bytesEqual = (left: BrowserBytes, right: BrowserBytes): boolean => {
        if (left.length !== right.length) {
          return false
        }
        for (let index = 0; index < left.length; index += 1) {
          if (left[index] !== right[index]) {
            return false
          }
        }
        return true
      }

      const store = new storeModule.OpfsEvidenceBlobStore()
      const staged = await store.stage(evaluatePayload.operationId, evaluatePayload.chunks)
      const stagedBytes = new Uint8Array(
        await (await store.read(staged.temporaryStorageRef)).arrayBuffer(),
      )
      const storageRef = await store.commit(
        staged,
        evaluatePayload.caseId,
        evaluatePayload.evidenceId,
      )
      const committedBytes = new Uint8Array(await (await store.read(storageRef)).arrayBuffer())
      const tempGoneAfterCommit = await store.exists(staged.temporaryStorageRef)

      const reopened = new storeModule.OpfsEvidenceBlobStore()
      const persistedBytes = new Uint8Array(await (await reopened.read(storageRef)).arrayBuffer())
      const refsBeforeDelete = await reopened.listCaseStorageRefs(evaluatePayload.caseId)
      await reopened.deleteCase(evaluatePayload.caseId)
      const formalGone = await reopened.exists(storageRef)
      const refsAfterDelete = await reopened.listCaseStorageRefs(evaluatePayload.caseId)
      const tempGone = await reopened.exists(staged.temporaryStorageRef)

      return {
        stagedSize: staged.size,
        stagedRef: staged.temporaryStorageRef,
        stagedMatch: bytesEqual(stagedBytes, evaluatePayload.expected),
        finalRef: storageRef,
        committedMatch: bytesEqual(committedBytes, evaluatePayload.expected),
        tempGoneAfterCommit,
        persistedMatch: bytesEqual(persistedBytes, evaluatePayload.expected),
        refsBeforeDelete,
        formalGone,
        refsAfterDelete,
        tempGone,
      }
    },
    payload,
  )

  expect(result).toEqual({
    stagedSize: 6,
    stagedRef: `temporary/${operationId}`,
    stagedMatch: true,
    finalRef: `cases/${caseId}/evidence/${evidenceId}`,
    committedMatch: true,
    tempGoneAfterCommit: false,
    persistedMatch: true,
    refsBeforeDelete: [`cases/${caseId}/evidence/${evidenceId}`],
    formalGone: false,
    refsAfterDelete: [],
    tempGone: false,
  })
})

test('deletes individual blobs and temporary files', async ({ page }) => {
  await page.goto('/')

  const payload = {
    caseId,
    evidenceId,
    operationId,
    chunks,
  }
  const result = await page.evaluate(
    async (evaluatePayload) => {
      const moduleUrl = '/node_modules/@youju/evidence-store/src/index.ts'
      const storeModule = (await import(moduleUrl)) as {
        OpfsEvidenceBlobStore: new () => BrowserBlobStore
      }
      const store = new storeModule.OpfsEvidenceBlobStore()

      const staged = await store.stage(evaluatePayload.operationId, evaluatePayload.chunks)
      await store.deleteTemporary(evaluatePayload.operationId)
      const tempGone = await store.exists(staged.temporaryStorageRef)

      const secondOperationId = '00000000-0000-4000-8000-000000000702'
      const stagedSecond = await store.stage(secondOperationId, evaluatePayload.chunks)
      const storageRef = await store.commit(
        stagedSecond,
        evaluatePayload.caseId,
        evaluatePayload.evidenceId,
      )
      await store.delete(storageRef)
      const formalGone = await store.exists(storageRef)
      const refs = await store.listCaseStorageRefs(evaluatePayload.caseId)

      return { tempGone, formalGone, refs }
    },
    payload,
  )

  expect(result).toEqual({ tempGone: false, formalGone: false, refs: [] })
})
