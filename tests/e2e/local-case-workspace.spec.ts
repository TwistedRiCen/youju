import { expect, test } from '@playwright/test'

test('creates a local case and recovers it after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '创建本地事件' }).click()
  await page.getByLabel('事件标题').fill('运输破损退款纠纷')
  await page.getByLabel('购买时间').fill('2026-07-01T12:16')
  await page.getByLabel('商家名称').fill('晴川生活示例店')
  await page.getByLabel('商品名称').fill('便携折叠桌（虚构商品）')
  await page.getByLabel('实付金额（元）').fill('899.00')
  await page.getByLabel('期望处理结果').fill('退货并退还已支付金额')
  await page.getByRole('button', { name: '创建事件' }).click()

  await expect(page.getByText('已保存到此设备')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('商家名称')).toHaveValue('晴川生活示例店')
})

test('autosaves workspace edits and recovers them after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '创建本地事件' }).click()
  await page.getByLabel('事件标题').fill('运输破损退款纠纷')
  await page.getByLabel('购买时间').fill('2026-07-01T12:16')
  await page.getByLabel('商家名称').fill('晴川生活示例店')
  await page.getByLabel('商品名称').fill('便携折叠桌（虚构商品）')
  await page.getByLabel('实付金额（元）').fill('899.00')
  await page.getByLabel('期望处理结果').fill('退货并退还已支付金额')
  await page.getByRole('button', { name: '创建事件' }).click()

  const merchantInput = page.getByLabel('商家名称')
  await expect(merchantInput).toHaveValue('晴川生活示例店')
  await expect(page.locator('.save-status')).toHaveText('已保存到此设备')
  const saveCompleted = page.evaluate(() => {
    const status = document.querySelector('.save-status')
    if (!(status instanceof HTMLElement)) {
      throw new Error('save_status_not_found')
    }
    return new Promise<void>((resolve, reject) => {
      let sawSaving = status.textContent === '正在保存…'
      const timeout = window.setTimeout(() => {
        observer.disconnect()
        reject(new Error('save_status_transition_timeout'))
      }, 5000)
      const observer = new MutationObserver(() => {
        if (status.textContent === '正在保存…') {
          sawSaving = true
        }
        if (sawSaving && status.textContent === '已保存到此设备') {
          observer.disconnect()
          window.clearTimeout(timeout)
          resolve()
        }
      })
      observer.observe(status, { childList: true, characterData: true, subtree: true })
    })
  })
  await merchantInput.fill('修改后的商家名称')
  await expect(merchantInput).toHaveValue('修改后的商家名称')
  await saveCompleted

  await page.reload()
  await expect(page.getByLabel('商家名称')).toHaveValue('修改后的商家名称')
})
