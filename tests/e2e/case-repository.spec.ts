import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

type DatabaseMigration = (database: IDBDatabase, transaction: IDBTransaction) => void

interface BrowserFactDraft {
  readonly id: string
  readonly caseId: string
  readonly factType: string
  readonly fieldName: string
  readonly value: string
  readonly sourceRefs: readonly { readonly evidenceId: string }[]
  readonly updatedAt: string
  readonly revision: number
}

interface BrowserCaseEvent {
  readonly id: string
  readonly scenarioType: 'ecommerce_refund'
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: 'draft'
  readonly requestedResolution: null
  readonly storageMode: 'local'
  readonly schemaVersion: 1
}

interface BrowserDatabase {
  readonly version: number
  readonly objectStoreNames: DOMStringList
  close(): void
}

interface BrowserStoredCase {
  readonly caseEvent: { readonly id: string; readonly title: string }
  readonly revision: number
  readonly lastWriterId: string
}

interface BrowserCaseAggregate extends BrowserStoredCase {
  readonly factDrafts: readonly { readonly id: string; readonly fieldName: string; readonly value: string }[]
}

interface BrowserCaseRepository {
  createCase(
    caseEvent: BrowserCaseEvent,
    drafts: readonly BrowserFactDraft[],
    writerId: string,
  ): Promise<BrowserStoredCase>
  listCases(): Promise<readonly BrowserStoredCase[]>
  getCase(caseId: string): Promise<BrowserCaseAggregate | null>
  updateCase(command: {
    readonly caseId: string
    readonly expectedRevision: number
    readonly patch: {
      readonly title?: string
      readonly status?: string
      readonly requestedResolution?: string | null
    }
    readonly updatedAt: string
    readonly writerId: string
  }): Promise<BrowserStoredCase>
  replaceFactDrafts(
    caseId: string,
    expectedRevision: number,
    drafts: readonly BrowserFactDraft[],
    writerId: string,
  ): Promise<number>
  close(): void
}

interface BrowserStorageModule {
  readonly DATABASE_MIGRATIONS: readonly DatabaseMigration[]
  openYoujuDatabase(migrations: readonly DatabaseMigration[]): Promise<BrowserDatabase>
  IndexedDbCaseRepository: new (database: BrowserDatabase) => BrowserCaseRepository
}

interface BrowserWindow {
  __youjuStorage?: BrowserStorageModule
  __youjuDatabase?: BrowserDatabase
  __youjuRepo?: BrowserCaseRepository
  __heldLegacyConnection?: { close(): void }
}

const caseId = '00000000-0000-4000-8000-000000000001'
const evidenceId = '00000000-0000-4000-8000-000000000101'

const caseEvent: BrowserCaseEvent = {
  id: caseId,
  scenarioType: 'ecommerce_refund',
  title: '运输破损退款纠纷',
  createdAt: '2026-07-31T01:00:00.000Z',
  updatedAt: '2026-07-31T01:00:00.000Z',
  status: 'draft',
  requestedResolution: null,
  storageMode: 'local',
  schemaVersion: 1,
}

const drafts: readonly BrowserFactDraft[] = [
  {
    id: '00000000-0000-4000-8000-000000000501',
    caseId,
    factType: 'order',
    fieldName: 'purchase_time',
    value: '2026-07-01T12:16:00.000Z',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:05:00.000Z',
    revision: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000502',
    caseId,
    factType: 'merchant',
    fieldName: 'merchant_name',
    value: '晴川生活示例店',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:05:00.000Z',
    revision: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000503',
    caseId,
    factType: 'product',
    fieldName: 'product_name',
    value: '便携折叠桌（虚构商品）',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:05:00.000Z',
    revision: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000504',
    caseId,
    factType: 'payment',
    fieldName: 'paid_amount',
    value: '89900',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:05:00.000Z',
    revision: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000505',
    caseId,
    factType: 'issue',
    fieldName: 'problem_description',
    value: '包裹外箱凹陷，桌板边角开裂并有明显压痕',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:05:00.000Z',
    revision: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000506',
    caseId,
    factType: 'resolution',
    fieldName: 'requested_resolution',
    value: '退货并退还已支付金额',
    sourceRefs: [{ evidenceId }],
    updatedAt: '2026-07-31T01:05:00.000Z',
    revision: 1,
  },
]

async function openRepositoryInPage(
  page: Page,
  migrations?: readonly DatabaseMigration[],
): Promise<void> {
  await page.goto('/')
  await page.evaluate(async (migrationList) => {
    const url = '/src/storage/index.ts'
    const storage = (await import(url)) as BrowserStorageModule
    const migrationsToUse = migrationList ?? storage.DATABASE_MIGRATIONS
    const database = await storage.openYoujuDatabase(migrationsToUse)
    const repository = new storage.IndexedDbCaseRepository(database)
    const host = window as unknown as BrowserWindow
    host.__youjuStorage = storage
    host.__youjuDatabase = database
    host.__youjuRepo = repository
  }, migrations)
}

test('creates, loads, updates, and replaces drafts with revision checks', async ({ page }) => {
  await openRepositoryInPage(page)

  const result = await page.evaluate(async (payload) => {
    const host = window as unknown as BrowserWindow
    const repository = host.__youjuRepo as BrowserCaseRepository

    const created = await repository.createCase(payload.caseEvent, payload.drafts, 'writer-a')
    const loaded = await repository.getCase(payload.caseEvent.id)
    const updated = await repository.updateCase({
      caseId: payload.caseEvent.id,
      expectedRevision: 1,
      patch: { title: '运输破损退款纠纷（已保存）' },
      updatedAt: '2026-07-31T02:00:00.000Z',
      writerId: 'writer-a',
    })

    let conflictCode: string | undefined
    try {
      await repository.updateCase({
        caseId: payload.caseEvent.id,
        expectedRevision: 1,
        patch: { title: '过期写入' },
        updatedAt: '2026-07-31T02:01:00.000Z',
        writerId: 'writer-b',
      })
    } catch (error) {
      conflictCode = (error as { code?: unknown }).code as string | undefined
    }

    const listed = await repository.listCases()
    const draftRevision = await repository.replaceFactDrafts(
      payload.caseEvent.id,
      2,
      payload.drafts.slice(0, 2),
      'writer-a',
    )
    const afterReplace = await repository.getCase(payload.caseEvent.id)
    const storeNames = Array.from(host.__youjuDatabase?.objectStoreNames ?? []).sort()

    return {
      createdRevision: created.revision,
      title: loaded?.caseEvent.title ?? null,
      draftCount: loaded?.factDrafts.length ?? 0,
      updatedRevision: updated.revision,
      conflictCode,
      listedCount: listed.length,
      draftRevision,
      afterReplaceDraftCount: afterReplace?.factDrafts.length ?? 0,
      storeNames,
    }
  }, { caseEvent, drafts })

  expect(result).toEqual({
    createdRevision: 1,
    title: '运输破损退款纠纷',
    draftCount: 6,
    updatedRevision: 2,
    conflictCode: 'concurrent_edit_conflict',
    listedCount: 1,
    draftRevision: 3,
    afterReplaceDraftCount: 2,
    storeNames: [
      'cases',
      'confirmedFacts',
      'confirmedStatements',
      'evidenceMetadata',
      'factDrafts',
      'operationJournal',
      'statementDrafts',
      'timelineEntries',
    ],
  })
})

test('survives closing and reopening the repository', async ({ page }) => {
  await openRepositoryInPage(page)

  const result = await page.evaluate(async (payload) => {
    const host = window as unknown as BrowserWindow
    const repository = host.__youjuRepo as BrowserCaseRepository
    await repository.createCase(payload.caseEvent, payload.drafts, 'writer-a')
    repository.close()

    const storage = host.__youjuStorage as BrowserStorageModule
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const reopened = new storage.IndexedDbCaseRepository(database)
    const loaded = await reopened.getCase(payload.caseEvent.id)

    return {
      title: loaded?.caseEvent.title ?? null,
      draftCount: loaded?.factDrafts.length ?? 0,
      revision: loaded?.revision ?? 0,
    }
  }, { caseEvent, drafts })

  expect(result).toEqual({ title: '运输破损退款纠纷', draftCount: 6, revision: 1 })
})

test('migrates a legacy version 1 database and preserves its case', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async (payload) => {
    const createLegacyV1Database = (
      caseRecord: BrowserCaseEvent,
      draft: BrowserFactDraft,
    ): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('youju-local', 1)
        request.onupgradeneeded = () => {
          const database = request.result
          database.createObjectStore('cases', { keyPath: 'id' })
          database.createObjectStore('factDrafts', { keyPath: 'id' })
        }
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction(['cases', 'factDrafts'], 'readwrite')
          transaction
            .objectStore('cases')
            .put({ ...caseRecord, revision: 1, lastWriterId: 'legacy-writer' })
          transaction.objectStore('factDrafts').put(draft)
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
        }
        request.onerror = () => reject(request.error)
      })

    await createLegacyV1Database(payload.caseEvent, payload.drafts[0]!)
  }, { caseEvent, drafts })

  await openRepositoryInPage(page)

  const result = await page.evaluate(async (caseIdentifier) => {
    const host = window as unknown as BrowserWindow
    const repository = host.__youjuRepo as BrowserCaseRepository
    const loaded = await repository.getCase(caseIdentifier)
    return {
      title: loaded?.caseEvent.title ?? null,
      draftCount: loaded?.factDrafts.length ?? 0,
      version: host.__youjuDatabase?.version ?? 0,
    }
  }, caseId)

  expect(result).toEqual({ title: '运输破损退款纠纷', draftCount: 1, version: 2 })
})

test('aborts a failing migration and keeps version 1 data readable', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async (payload) => {
    const createLegacyV1Database = (draft: BrowserFactDraft): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('youju-local', 1)
        request.onupgradeneeded = () => {
          const database = request.result
          database.createObjectStore('cases', { keyPath: 'id' })
          database.createObjectStore('factDrafts', { keyPath: 'id' })
        }
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction(['cases', 'factDrafts'], 'readwrite')
          transaction
            .objectStore('cases')
            .put({ ...payload.caseEvent, revision: 1, lastWriterId: 'legacy-writer' })
          transaction.objectStore('factDrafts').put(draft)
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
        }
        request.onerror = () => reject(request.error)
      })

    await createLegacyV1Database(payload.drafts[0]!)
  }, { caseEvent, drafts })

  const failure = await page.evaluate(async (caseIdentifier) => {
    const url = '/src/storage/index.ts'
    const storage = (await import(url)) as BrowserStorageModule
    const firstMigration = storage.DATABASE_MIGRATIONS[0] as DatabaseMigration
    const failingMigrations = [
      firstMigration,
      () => {
        throw new Error('injected migration failure')
      },
    ]

    let failedCode: string | undefined
    try {
      await storage.openYoujuDatabase(failingMigrations)
    } catch (error) {
      failedCode = (error as { code?: unknown }).code as string | undefined
    }

    const probeDatabaseVersion = (): Promise<number> =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('youju-local')
        request.onsuccess = () => {
          const version = request.result.version
          request.result.close()
          resolve(version)
        }
        request.onerror = () => reject(request.error)
      })
    const versionAfterFailure = await probeDatabaseVersion()

    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const loaded = await repository.getCase(caseIdentifier)

    return {
      failedCode,
      versionAfterFailure,
      recoveredTitle: loaded?.caseEvent.title ?? null,
    }
  }, caseId)

  expect(failure).toEqual({
    failedCode: 'storage_unavailable',
    versionAfterFailure: 1,
    recoveredTitle: '运输破损退款纠纷',
  })
})

test('refuses a newer unknown database version without deleting it', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('youju-local', 3)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('futureStore', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  })

  const refusal = await page.evaluate(async () => {
    const url = '/src/storage/index.ts'
    const storage = (await import(url)) as BrowserStorageModule

    let refusedCode: string | undefined
    try {
      await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    } catch (error) {
      refusedCode = (error as { code?: unknown }).code as string | undefined
    }

    const probeDatabaseVersion = (): Promise<number> =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('youju-local')
        request.onsuccess = () => {
          const version = request.result.version
          request.result.close()
          resolve(version)
        }
        request.onerror = () => reject(request.error)
      })
    const version = await probeDatabaseVersion()

    return { refusedCode, version }
  })

  expect(refusal).toEqual({ refusedCode: 'storage_not_supported', version: 3 })
})

test('reports a low-sensitivity error when an upgrade is blocked', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async (payload) => {
    const createLegacyV1Database = (draft: BrowserFactDraft, keepOpen: boolean): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('youju-local', 1)
        request.onupgradeneeded = () => {
          const database = request.result
          database.createObjectStore('cases', { keyPath: 'id' })
          database.createObjectStore('factDrafts', { keyPath: 'id' })
        }
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction(['cases', 'factDrafts'], 'readwrite')
          transaction
            .objectStore('cases')
            .put({ ...payload.caseEvent, revision: 1, lastWriterId: 'legacy-writer' })
          transaction.objectStore('factDrafts').put(draft)
          transaction.oncomplete = () => {
            if (keepOpen) {
              const host = window as unknown as BrowserWindow
              host.__heldLegacyConnection = { close: () => database.close() }
            } else {
              database.close()
            }
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
        }
        request.onerror = () => reject(request.error)
      })

    await createLegacyV1Database(payload.drafts[0]!, true)
  }, { caseEvent, drafts })

  const blockedCode = await page.evaluate(async () => {
    const url = '/src/storage/index.ts'
    const storage = (await import(url)) as BrowserStorageModule
    const host = window as unknown as BrowserWindow
    host.__youjuStorage = storage

    let code: string | undefined
    try {
      await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    } catch (error) {
      code = (error as { code?: unknown }).code as string | undefined
    }
    return code
  })

  expect(blockedCode).toBe('storage_unavailable')

  const recovered = await page.evaluate(async (caseIdentifier) => {
    const host = window as unknown as BrowserWindow
    host.__heldLegacyConnection?.close()
    const storage = host.__youjuStorage as BrowserStorageModule
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const loaded = await repository.getCase(caseIdentifier)

    return {
      title: loaded?.caseEvent.title ?? null,
      version: database.version,
    }
  }, caseId)

  expect(recovered).toEqual({ title: '运输破损退款纠纷', version: 2 })
})
