import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function installPersistenceStub(page: Page, result: boolean): Promise<() => number> {
  let calls = 0
  await page.exposeFunction('__youjuRecordPersistenceRequest', () => {
    calls += 1
  })
  await page.addInitScript((granted) => {
    Object.defineProperty(navigator.storage, 'persisted', {
      configurable: true,
      value: async () => false,
    })
    Object.defineProperty(navigator.storage, 'persist', {
      configurable: true,
      value: async () => {
        await (window as unknown as {
          __youjuRecordPersistenceRequest(): Promise<void>
        }).__youjuRecordPersistenceRequest()
        return granted
      },
    })
  }, result)
  return () => calls
}

async function createCase(page: Page): Promise<void> {
  await page.getByRole('link', { name: '创建本地事件' }).click()
  await page.getByLabel('事件标题').fill('持久化提示测试事件')
  await page.getByLabel('购买时间').fill('2026-08-01T10:00')
  await page.getByLabel('商家名称').fill('青禾示例店')
  await page.getByLabel('商品名称').fill('虚构测试商品')
  await page.getByLabel('实付金额（元）').fill('99.00')
  await page.getByLabel('期望处理结果').fill('退货退款')
  await page.getByRole('button', { name: '创建事件' }).click()
  await expect(page.getByText('可编辑')).toBeVisible()
}

test('guides first use and requests persistence only after creating a real case', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS 与 StorageManager persist')
  const persistenceCalls = await installPersistenceStub(page, false)
  await page.goto('/')

  const guide = page.getByRole('dialog', { name: '首次使用有据' })
  await expect(guide).toBeVisible()
  await expect(guide.locator('[data-guide-step]')).toHaveCount(3)
  expect(persistenceCalls()).toBe(0)
  await guide.getByRole('button', { name: '跳过' }).click()
  await expect(guide).toBeHidden()

  await createCase(page)
  await expect(page.getByText('浏览器未确认持久保存')).toBeVisible()
  await expect(page.getByText(/请及时导出备份/)).toBeVisible()
  expect(persistenceCalls()).toBe(1)

  await page.reload()
  await expect(page.getByText('浏览器未确认持久保存')).toBeVisible()
  expect(persistenceCalls()).toBe(1)
  await page.getByRole('button', { name: '再次请求持久保存' }).click()
  expect(persistenceCalls()).toBe(2)

  const cleared = await page.evaluate(async () => {
    const caseServiceUrl = '/src/services/case-service.ts'
    const caseService = (await import(caseServiceUrl)) as {
      getCaseRepository(): Promise<unknown>
    }
    const persistenceUrl = '/src/browser/storage-persistence.ts'
    const persistence = (await import(persistenceUrl)) as {
      getAppPreferencesRepository(): Promise<unknown>
    }
    const deletionUrl = '/src/services/delete-case-service.ts'
    const deletion = (await import(deletionUrl)) as {
      deleteAllLocalData(dependencies: Record<string, unknown>): Promise<{ status: string }>
    }
    const evidenceUrl = '/node_modules/@youju/evidence-store/src/index.ts'
    const evidence = (await import(evidenceUrl)) as {
      OpfsEvidenceBlobStore: new () => unknown
    }
    return deletion.deleteAllLocalData({
      repository: await caseService.getCaseRepository(),
      preferences: await persistence.getAppPreferencesRepository(),
      blobStore: new evidence.OpfsEvidenceBlobStore(),
    })
  })
  expect(cleared).toEqual({ status: 'deleted' })

  await page.goto('/')
  await expect(page.getByRole('dialog', { name: '首次使用有据' })).toBeVisible()
  expect(persistenceCalls()).toBe(2)
})

test('requests after a successful real import but never for duplicate or demo data', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS 与 StorageManager persist')
  const persistenceCalls = await installPersistenceStub(page, false)
  await page.goto('/')
  await page.getByRole('dialog', { name: '首次使用有据' })
    .getByRole('button', { name: '跳过' })
    .click()

  const userCaseId = await page.evaluate(async () => {
    const caseServiceUrl = '/src/services/case-service.ts'
    const caseService = (await import(caseServiceUrl)) as {
      getCaseRepository(): Promise<{
        createCase(caseEvent: Record<string, unknown>, drafts: readonly unknown[], writerId: string): Promise<unknown>
      }>
    }
    const repository = await caseService.getCaseRepository()
    const caseId = crypto.randomUUID()
    const now = new Date().toISOString()
    await repository.createCase({
      id: caseId,
      scenarioType: 'ecommerce_refund',
      title: '预置真实事件',
      createdAt: now,
      updatedAt: now,
      status: 'draft',
      requestedResolution: '退款',
      storageMode: 'local',
      schemaVersion: 2,
      dataOrigin: 'user_created',
      demoFixtureId: null,
    }, [], 'e2e')
    return caseId
  })

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04,
  ])
  await page.goto(`/cases/${userCaseId}/materials`)
  await page.setInputFiles('input[type="file"]', {
    name: 'real.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByText('real.png：已导入')).toBeVisible()
  expect(persistenceCalls()).toBe(1)

  await page.setInputFiles('input[type="file"]', {
    name: 'real.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByText('real.png：重复材料，已跳过')).toBeVisible()
  expect(persistenceCalls()).toBe(1)

  const demoCaseId = await page.evaluate(async () => {
    const persistenceUrl = '/src/browser/storage-persistence.ts'
    const persistence = (await import(persistenceUrl)) as {
      getAppPreferencesRepository(): Promise<{
        get(): Promise<Record<string, unknown> | null>
        put(value: Record<string, unknown>): Promise<void>
      }>
    }
    const preferences = await persistence.getAppPreferencesRepository()
    const current = await preferences.get()
    await preferences.put({ ...current, storagePersistence: 'unknown' })

    const demoUrl = '/src/demo/index.ts'
    const demo = (await import(demoUrl)) as {
      loadDemoCase(fixtureId: string): Promise<{ caseId: string }>
    }
    return (await demo.loadDemoCase('m4-ecommerce-refund-demo-v1')).caseId
  })
  expect(persistenceCalls()).toBe(1)

  await page.goto(`/cases/${demoCaseId}/materials`)
  await page.setInputFiles('input[type="file"]', {
    name: 'demo-extra.png',
    mimeType: 'image/png',
    buffer: Buffer.from([...png, 0x05]),
  })
  await expect(page.getByText('demo-extra.png：已导入')).toBeVisible()
  expect(persistenceCalls()).toBe(1)
})
