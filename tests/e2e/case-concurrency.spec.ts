import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function createCase(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('link', { name: '创建本地事件' }).click()
  await page.getByLabel('事件标题').fill('运输破损退款纠纷')
  await page.getByLabel('购买时间').fill('2026-07-01T12:16')
  await page.getByLabel('商家名称').fill('晴川生活示例店')
  await page.getByLabel('商品名称').fill('便携折叠桌（虚构商品）')
  await page.getByLabel('实付金额（元）').fill('899.00')
  await page.getByLabel('期望处理结果').fill('退货并退还已支付金额')
  await page.getByRole('button', { name: '创建事件' }).click()
  await expect(page.getByText('可编辑')).toBeVisible()
}

test('second tab is read-only while the first tab holds the write lock', async ({ page }) => {
  await createCase(page)
  const workspaceUrl = page.url()

  const secondPage = await page.context().newPage()
  await secondPage.goto(workspaceUrl)

  await expect(secondPage.getByText('另一标签页正在编辑，本页只读')).toBeVisible()
  await expect(secondPage.getByLabel('商家名称')).toBeDisabled()

  await page.close()
  await expect
    .poll(async () => {
      const acquireButton = secondPage.getByRole('button', { name: '获取编辑权' })
      if (await acquireButton.isVisible()) {
        await acquireButton.click()
      }
      return secondPage.getByText('可编辑').isVisible()
    })
    .toBe(true)
  await expect(secondPage.getByLabel('商家名称')).toBeEnabled()
  await secondPage.close()
})

test('child case routes remain read-only in a secondary tab', async ({ page }) => {
  await createCase(page)
  const workspaceUrl = page.url()

  const secondPage = await page.context().newPage()
  await secondPage.goto(`${workspaceUrl}/facts`)

  await expect(secondPage.getByText('另一个标签页正在编辑，本页只读')).toBeVisible()
  await expect(secondPage.getByRole('textbox', { name: '商家名称' })).toBeDisabled()

  await page.close()
  await secondPage.getByRole('button', { name: '获取编辑权' }).click()
  await expect(secondPage.getByRole('textbox', { name: '商家名称' })).toBeEnabled()

  const thirdPage = await secondPage.context().newPage()
  await thirdPage.goto(`${workspaceUrl}/timeline`)
  await expect(thirdPage.getByRole('textbox', { name: '摘要' })).toBeDisabled()
  await thirdPage.close()
  await secondPage.close()
})

test('editing continues with revision protection when Web Locks are absent', async ({
  browser,
}) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'locks', {
      configurable: true,
      get: () => undefined,
    })
  })
  const page = await context.newPage()
  await page.goto('/')

  const result = await page.evaluate(async () => {
    const url = '/src/storage/index.ts'
    const storage = (await import(url)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        createCase(
          caseEvent: Record<string, unknown>,
          drafts: readonly Record<string, unknown>[],
          writerId: string,
        ): Promise<unknown>
        updateCase(command: Record<string, unknown>): Promise<unknown>
      }
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const caseId = '00000000-0000-4000-8000-000000000901'
    const caseEvent = {
      id: caseId,
      scenarioType: 'ecommerce_refund',
      title: '无锁冲突测试',
      createdAt: '2026-07-31T03:00:00.000Z',
      updatedAt: '2026-07-31T03:00:00.000Z',
      status: 'draft',
      requestedResolution: null,
      storageMode: 'local',
      schemaVersion: 1,
    }
    const draft = {
      id: '00000000-0000-4000-8000-000000000951',
      caseId,
      factType: 'merchant',
      fieldName: 'merchant_name',
      value: '示例店',
      sourceRefs: [],
      updatedAt: '2026-07-31T03:00:00.000Z',
      revision: 1,
    }
    await repository.createCase(caseEvent, [draft], 'writer-a')
    await repository.updateCase({
      caseId,
      expectedRevision: 1,
      patch: { title: '已更新' },
      updatedAt: '2026-07-31T03:01:00.000Z',
      writerId: 'writer-a',
    })

    let conflictCode: string | undefined
    try {
      await repository.updateCase({
        caseId,
        expectedRevision: 1,
        patch: { title: '过期写入' },
        updatedAt: '2026-07-31T03:02:00.000Z',
        writerId: 'writer-b',
      })
    } catch (error) {
      conflictCode = (error as { code?: unknown }).code as string | undefined
    }

    return {
      conflictCode,
      locksSupported: typeof navigator.locks !== 'undefined',
    }
  })

  expect(result).toEqual({ conflictCode: 'concurrent_edit_conflict', locksSupported: false })

  await createCase(page)
  await expect(page.getByText('当前浏览器不支持多标签页编辑保护')).toBeVisible()
  await expect(page.getByLabel('商家名称')).toBeEnabled()
  await context.close()
})
