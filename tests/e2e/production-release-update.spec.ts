import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const swPath = path.join(process.cwd(), 'apps/web/dist/sw.js')

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

test('keeps local case data across a confirmed release update while page memory clears', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await dismissFirstUseGuide(page)
  await waitForController(page)
  await expect(page.getByText('已可离线使用')).toBeVisible().catch(() => undefined)

  await page.getByRole('link', { name: '创建本地事件' }).click()
  await page.getByLabel('事件标题').fill('更新保留哨兵事件')
  await page.getByLabel('购买时间').fill('2026-08-01T10:00')
  await page.getByLabel('商家名称').fill('晴川生活示例店')
  await page.getByLabel('商品名称').fill('虚构哨兵商品')
  await page.getByLabel('实付金额（元）').fill('99.00')
  await page.getByLabel('期望处理结果').fill('退货退款')
  await page.getByRole('button', { name: '创建事件' }).click()
  await expect(page.getByText('可编辑')).toBeVisible()

  // Page-memory stand-in for the AI session Key: the Key lives only in the
  // page session and is cleared by the same reload the update performs.
  await page.evaluate(() => {
    ;(window as unknown as { __pageMemoryKey: string }).__pageMemoryKey = 'sentinel-key-value'
  })

  const original = readFileSync(swPath, 'utf8')
  try {
    writeFileSync(swPath, `${original}\n// simulated release B\n`)
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()))
    await expect(page.getByRole('button', { name: '立即更新' })).toBeVisible()
    await page.getByRole('button', { name: '立即更新' }).click({ noWaitAfter: true })

    // The confirmed update reloads the current page: page memory clears,
    // local case data remains.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => (window as unknown as { __pageMemoryKey?: string }).__pageMemoryKey,
          ),
        { timeout: 30_000 },
      )
      .toBe(undefined)

    await dismissFirstUseGuide(page)
    await expect(page.getByLabel('商家名称')).toHaveValue('晴川生活示例店')
  } finally {
    writeFileSync(swPath, original)
  }
})
