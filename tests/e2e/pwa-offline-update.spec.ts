import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

const swPath = path.join(process.cwd(), 'apps/web/dist/sw.js')

async function dismissFirstUseGuide(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: '跳过' })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    // Dismissal persists the seen version before closing; wait for the
    // dialog to disappear so a following reload cannot lose the write.
    await expect(page.locator('dialog.guide-dialog')).toBeHidden()
  }
}

async function waitForController(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready)
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null)
  if (!controlled) {
    // The prompt-mode worker does not claim existing clients; one reload
    // puts the page under the service worker's control.
    await page.reload()
    await page.evaluate(() => navigator.serviceWorker.ready)
    // The reload can abort the guide-dismiss write transaction; close the
    // guide again if it reappeared before touching update controls.
    await dismissFirstUseGuide(page)
  }
}

async function cacheUrls(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    const urls: string[] = []
    for (const key of await caches.keys()) {
      const cache = await caches.open(key)
      urls.push(...(await cache.keys()).map((request) => request.url))
    }
    return urls
  })
}

async function syncTags(context: BrowserContext): Promise<readonly string[]> {
  const pages = context.pages()
  const page = pages[0] ?? (await context.newPage())
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    const sync = registration as { sync?: { getTags(): Promise<string[]> } } | null
    if (sync === null || sync.sync === undefined) {
      return []
    }
    try {
      return await sync.sync.getTags()
    } catch {
      // Chromium may disable Background Sync in this context; when disabled,
      // no sync tags can exist by definition.
      return []
    }
  })
}

test('installs the strict offline shell and keeps /ai and /health out of cache', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await expect(page.getByText('已可离线使用')).toBeVisible()
  await waitForController(page)

  const urls = await cacheUrls(page)
  expect(urls.length).toBeGreaterThan(0)
  expect(urls.some((url) => url.includes('/ai/') || url.includes('/health'))).toBe(false)
  expect(urls.some((url) => url.startsWith('blob:'))).toBe(false)
  expect(urls.some((url) => url.includes('demo/m4-ecommerce-refund-demo-v1/manifest.json'))).toBe(true)
  expect(
    urls.some((url) => url.includes('demo/m4-ecommerce-refund-demo-v1/binary/02-payment-record.pdf')),
  ).toBe(true)
  expect(
    urls.some((url) => url.includes('demo/m4-ecommerce-refund-demo-v1/evidence/01-order-record.json')),
  ).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '有据', level: 1 })).toBeVisible()
  // Chromium resets navigator.onLine after a service-worker-served reload
  // under Playwright offline emulation, so drive the controller's real
  // browser listener instead of relying on the environment flag.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(page.getByText('当前离线')).toBeVisible()

  await expect(
    page.evaluate(() => fetch('/ai/never').then(() => 'ok').catch(() => 'rejected')),
  ).resolves.toBe('rejected')
  expect(await syncTags(context)).toEqual([])

  await context.setOffline(false)
  await page.reload()
  await expect(page.getByText('当前离线')).not.toBeVisible()
})

test('prompts before updating and never reloads automatically', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await expect(page.getByText('已可离线使用')).toBeVisible()
  await waitForController(page)

  await page.evaluate(() => {
    ;(window as unknown as { __noAutoReload: string }).__noAutoReload = 'alive'
  })

  const original = readFileSync(swPath, 'utf8')
  try {
    writeFileSync(swPath, `${original}\n// simulated release B\n`)
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()))

    await expect(page.getByRole('button', { name: '立即更新' })).toBeVisible()
    await expect(page.getByText(/清空页面会话中的 API Key/)).toBeVisible()
    expect(
      await page.evaluate(() => (window as unknown as { __noAutoReload: string }).__noAutoReload),
    ).toBe('alive')

    // The confirm handler reloads the page after the new worker activates;
    // noWaitAfter keeps the click from waiting on that navigation.
    await page.getByRole('button', { name: '立即更新' }).click({ noWaitAfter: true })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: '立即更新' })).not.toBeVisible()
  } finally {
    writeFileSync(swPath, original)
  }
})
