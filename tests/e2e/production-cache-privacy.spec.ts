import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SENSITIVE_MARKERS = ['隐私哨兵商家', '隐私哨兵事件标题', 'sk-', 'DEMO-']

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

async function waitForController(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready)
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null)
  if (!controlled) {
    await page.reload()
    await page.evaluate(() => navigator.serviceWorker.ready)
    await dismissFirstUseGuide(page)
  }
}

async function createPrivateCase(page: Page): Promise<string> {
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await page.getByRole('link', { name: '创建本地事件' }).click()
  await page.getByLabel('事件标题').fill('隐私哨兵事件标题')
  await page.getByLabel('购买时间').fill('2026-08-01T10:00')
  await page.getByLabel('商家名称').fill('隐私哨兵商家')
  await page.getByLabel('商品名称').fill('虚构哨兵商品')
  await page.getByLabel('实付金额（元）').fill('99.00')
  await page.getByLabel('期望处理结果').fill('退货退款')
  await page.getByRole('button', { name: '创建事件' }).click()
  await expect(page.getByText('可编辑')).toBeVisible()
  const caseId = new URL(page.url()).pathname.split('/')[2] ?? ''
  expect(caseId).toMatch(/^[0-9a-f-]{36}$/)
  return caseId
}

test('keeps every Cache Storage entry inside the allowlist without user or AI data', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await waitForController(page)

  const privateCaseId = await createPrivateCase(page)
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await page.getByRole('button', { name: '加载完全虚构演示' }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+$/)
  const demoCaseId = new URL(page.url()).pathname.split('/')[2] ?? ''

  const cacheInfo = await page.evaluate(async () => {
    const entries: { url: string; bodyStart: string }[] = []
    for (const key of await caches.keys()) {
      const cache = await caches.open(key)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        const text = response === undefined ? '' : (await response.text()).slice(0, 256)
        entries.push({ url: request.url, bodyStart: text })
      }
    }
    return entries
  })

  expect(cacheInfo.length).toBeGreaterThan(0)
  const urls = cacheInfo.map((entry) => entry.url)
  const bodies = cacheInfo.map((entry) => entry.bodyStart).join('\n')

  for (const url of urls) {
    expect(url).not.toContain('/ai/')
    expect(url).not.toContain('/health')
    expect(url.startsWith('blob:')).toBe(false)
    expect(url.endsWith('.zip')).toBe(false)
  }
  for (const marker of SENSITIVE_MARKERS) {
    expect(urls.join('\n'), `marker ${marker} in cached URLs`).not.toContain(marker)
    expect(bodies, `marker ${marker} in cached bodies`).not.toContain(marker)
  }
  expect(urls.join('\n')).not.toContain(privateCaseId)
  expect(urls.join('\n')).not.toContain(demoCaseId)

  const allowlisted = urls.every((url) => {
    const path = new URL(url).pathname
    return (
      path.startsWith('/assets/') ||
      path.startsWith('/demo/m4-ecommerce-refund-demo-v1/') ||
      path === '/index.html' ||
      path === '/sw.js' ||
      path === '/manifest.webmanifest'
    )
  })
  expect(allowlisted).toBe(true)

  const indexedDbHoldsCase = await page.evaluate(async (caseId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open('youju-local', 4)
      openRequest.onsuccess = () => resolve(openRequest.result)
      openRequest.onerror = () => reject(openRequest.error)
    })
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction('cases', 'readonly')
        const request = transaction.objectStore('cases').get(caseId)
        request.onsuccess = () => resolve(request.result !== undefined)
        request.onerror = () => reject(request.error)
      })
    } finally {
      database.close()
    }
  }, privateCaseId)
  expect(indexedDbHoldsCase).toBe(true)
})
