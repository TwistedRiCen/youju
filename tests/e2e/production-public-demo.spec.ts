import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const demoTitle = '运输破损退款纠纷（完全虚构）'

async function dismissFirstUseGuide(page: Page): Promise<void> {
  const dialog = page.locator('dialog.guide-dialog')
  try {
    await dialog.waitFor({ state: 'visible', timeout: 1500 })
    await page.getByRole('button', { name: '跳过' }).click()
    await dialog.waitFor({ state: 'hidden' })
  } catch {
    // Guide already dismissed in this profile.
  }
}

test('runs the complete no-AI demo under production headers with paired release IDs', async ({
  page,
}) => {
  test.setTimeout(120_000)
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
  await expect(page.getByText('完全虚构演示数据', { exact: true })).toBeVisible()

  await page.goto(`/cases/${caseId}/materials`)
  for (const name of ['01-order-record.png', '02-payment-record.pdf']) {
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }

  await page.goto(`/cases/${caseId}/export`)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '生成材料包' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^DEMO-有据_事件材料包_\d{8}_\d{4}\.zip$/)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const archive = unzipSync(new Uint8Array(readFileSync(downloadPath!)))
  const readme = Object.entries(archive).find(([name]) => name.endsWith('/DEMO-README.txt'))
  expect(readme).toBeDefined()
  expect(new TextDecoder().decode(readme?.[1])).toContain('完全虚构演示数据，请勿作为真实材料提交')

  // Return through the workspace so the interrupted package_export journal
  // entry is recovered before deletion verification runs.
  await page.getByRole('link', { name: '返回事件工作台' }).click()
  await page.getByRole('link', { name: '删除事件' }).click()
  await page.getByLabel('输入事件标题以确认删除').fill(demoTitle)
  await page.getByRole('button', { name: '永久删除' }).click()
  await expect(page).toHaveURL(/\/$/)

  const residue = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open('youju-local', 4)
      openRequest.onsuccess = () => resolve(openRequest.result)
      openRequest.onerror = () => reject(openRequest.error)
    })
    const readAll = (storeName: string): Promise<readonly unknown[]> =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly')
        const request = transaction.objectStore(storeName).getAll()
        request.onsuccess = () => resolve(request.result ?? [])
        request.onerror = () => reject(request.error)
      })
    try {
      const [cases, operations] = await Promise.all([readAll('cases'), readAll('operationJournal')])
      return { caseCount: cases.length, operationCount: operations.length }
    } finally {
      database.close()
    }
  })
  expect(residue).toEqual({ caseCount: 0, operationCount: 0 })
  expect(requests.some((url) => new URL(url).pathname.startsWith('/ai/'))).toBe(false)
})

test('pairs the web release descriptor with the API health release ID', async ({ request, page }) => {
  const releaseResponse = await request.get('/release.json')
  expect(releaseResponse.status()).toBe(200)
  const descriptor = (await releaseResponse.json()) as { releaseId?: unknown }
  expect(typeof descriptor.releaseId).toBe('string')

  const healthResponse = await request.get('http://127.0.0.1:3000/health')
  expect(healthResponse.status()).toBe(200)
  const health = (await healthResponse.json()) as Record<string, unknown>
  expect(Object.keys(health).sort()).toEqual(['releaseId', 'status'])
  expect(health.status).toBe('ok')
  expect(health.releaseId).toBe(descriptor.releaseId)

  await page.goto('/about')
  await dismissFirstUseGuide(page)
  await expect(page.locator('[data-release-id]')).toContainText(String(descriptor.releaseId))
})
