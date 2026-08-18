import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const fixtureId = 'm4-ecommerce-refund-demo-v1'
const demoTitle = '运输破损退款纠纷（完全虚构）'
const warning = '完全虚构演示数据，请勿作为真实材料提交'

async function dismissFirstUseGuide(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: '跳过' })
  await expect(skip).toBeVisible()
  await skip.click()
}

async function expectDemoBanner(page: Page): Promise<void> {
  await expect(page.getByText('完全虚构演示数据', { exact: true })).toBeVisible()
  await expect(page.getByText('仅用于体验有据，请勿作为真实材料提交。')).toBeVisible()
}

test('completes the public no-AI demo walkthrough, export, deletion, and readback', async ({ page }) => {
  test.setTimeout(90_000)
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.route('**/*', (route) => {
    const path = new URL(route.request().url()).pathname
    return path.startsWith('/ai/') ? route.abort() : route.continue()
  })

  await page.goto('/')
  await dismissFirstUseGuide(page)
  await page.getByRole('button', { name: '加载完全虚构演示' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  const caseId = new URL(page.url()).pathname.split('/')[2] ?? ''
  await expectDemoBanner(page)
  await expect(page.getByRole('heading', { name: demoTitle })).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('button', { name: '打开已有演示' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重置演示案例' })).toBeVisible()
  await page.getByRole('button', { name: '打开已有演示' }).click()
  await expect(page).toHaveURL(new RegExp(`/cases/${caseId}$`))

  await page.getByRole('link', { name: '材料', exact: true }).click()
  await expectDemoBanner(page)
  for (const name of [
    '01-order-record.png',
    '02-payment-record.pdf',
    '03-product-issue.png',
    '04-merchant-communication.pdf',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }

  await page.goto(`/cases/${caseId}/facts`)
  await expectDemoBanner(page)
  await expect(page.getByRole('heading', { name: '当前正式事实' })).toBeVisible()
  await expect(page.getByText(/merchant_name：晴川生活示例店/)).toBeVisible()

  await page.goto(`/cases/${caseId}/timeline`)
  await expectDemoBanner(page)
  await expect(page.getByRole('heading', { name: '用户下单并完成付款' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '商家拒绝退货退款' })).toBeVisible()

  await page.goto(`/cases/${caseId}/findings`)
  await expectDemoBanner(page)
  await expect(page.getByRole('heading', { name: '缺口检查' })).toBeVisible()
  await expect(page.getByText('没有发现缺口。')).toBeVisible()

  await page.goto(`/cases/${caseId}/statement`)
  await expectDemoBanner(page)
  await expect(page.getByText('陈述已确认')).toBeVisible()
  await expect(page.getByLabel('事实陈述内容')).toHaveValue(/完全虚构的公开演示内容/)

  await page.goto(`/cases/${caseId}/export`)
  await expectDemoBanner(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成材料包' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^DEMO-有据_事件材料包_\d{8}_\d{4}\.zip$/)
  const path = await download.path()
  expect(path).not.toBeNull()
  const archive = unzipSync(new Uint8Array(readFileSync(path!)))
  const readme = Object.entries(archive).find(([name]) => name.endsWith('/DEMO-README.txt'))
  expect(readme).toBeDefined()
  expect(new TextDecoder().decode(readme?.[1])).toContain(warning)

  await page.getByRole('link', { name: '返回事件工作台' }).click()
  await page.getByRole('link', { name: '删除事件' }).click()
  await expectDemoBanner(page)
  await page.getByLabel('输入事件标题以确认删除').fill(demoTitle)
  await page.getByRole('button', { name: '永久删除' }).click()
  await expect(page).toHaveURL(/\/$/)

  const residue = await page.evaluate(async (deletedCaseId) => {
    const caseServiceUrl = '/src/services/case-service.ts'
    const caseService = (await import(caseServiceUrl)) as {
      getCaseRepository(): Promise<{
        listCases(): Promise<readonly { caseEvent: { dataOrigin: string; demoFixtureId: string | null } }[]>
        listOperations(): Promise<readonly unknown[]>
      }>
    }
    const evidenceUrl = '/node_modules/@youju/evidence-store/src/index.ts'
    const evidence = (await import(evidenceUrl)) as {
      OpfsEvidenceBlobStore: new () => {
        listCaseStorageRefs(caseId: string): Promise<readonly string[]>
      }
    }
    const repository = await caseService.getCaseRepository()
    const cases = await repository.listCases()
    return {
      demoCount: cases.filter(
        ({ caseEvent }) =>
          caseEvent.dataOrigin === 'fictional_demo' && caseEvent.demoFixtureId === fixtureId,
      ).length,
      operationCount: (await repository.listOperations()).length,
      blobCount: (await new evidence.OpfsEvidenceBlobStore().listCaseStorageRefs(deletedCaseId)).length,
    }
  }, caseId)
  expect(residue).toEqual({ demoCount: 0, operationCount: 0, blobCount: 0 })
  expect(requests.some((url) => new URL(url).pathname.startsWith('/ai/'))).toBe(false)
})

test('exposes verified full local deletion and restores first-use guidance', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await page.getByRole('button', { name: '加载完全虚构演示' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)

  await page.goto('/privacy')
  await page.getByLabel('输入“删除全部本地数据”以确认').fill('删除全部本地数据')
  await page.getByRole('button', { name: '删除并核验全部本地数据' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: '首次使用有据' })).toBeVisible()

  const residue = await page.evaluate(async () => {
    const storageUrl = '/src/storage/index.ts'
    const storage = (await import(storageUrl)) as {
      openYoujuDatabase(migrations: readonly unknown[]): Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        listCases(): Promise<readonly unknown[]>
        listOperations(): Promise<readonly unknown[]>
        close(): void
      }
      IndexedDbAppPreferencesRepository: new (database: unknown) => {
        get(): Promise<unknown | null>
      }
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const cases = new storage.IndexedDbCaseRepository(database)
    const preferences = new storage.IndexedDbAppPreferencesRepository(database)
    const result = {
      caseCount: (await cases.listCases()).length,
      operationCount: (await cases.listOperations()).length,
      preferences: await preferences.get(),
    }
    cases.close()
    return result
  })
  expect(residue).toEqual({ caseCount: 0, operationCount: 0, preferences: null })
})
