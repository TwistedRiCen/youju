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

async function importEvidence(page: Page): Promise<void> {
  await page.getByRole('link', { name: '材料' }).click()
  await page.setInputFiles('input[type="file"]', [
    {
      name: '订单.png',
      mimeType: 'image/png',
      buffer: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04,
      ]),
    },
    {
      name: '沟通.png',
      mimeType: 'image/png',
      buffer: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x12, 0x13, 0x14,
      ]),
    },
  ])
  await expect(page.getByRole('heading', { name: '订单.png' })).toBeVisible()
  await page.getByRole('link', { name: '返回事件工作台' }).click()
}

test('adds, confirms and reorders timeline entries with conflict detection', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')
  await createCase(page)
  await importEvidence(page)
  await page.getByRole('link', { name: '时间线' }).click()
  await expect(page.getByRole('heading', { name: '时间线' })).toBeVisible()

  await page.getByRole('textbox', { name: '摘要' }).fill('下单')
  await page.getByRole('textbox', { name: '时间' }).fill('2026-07-01T12:16')
  await page.getByLabel('关联材料：订单.png').check()
  await page.getByRole('button', { name: '添加时间线' }).click()

  await page.getByRole('textbox', { name: '摘要' }).fill('发货')
  await page.getByRole('textbox', { name: '时间' }).fill('2026-07-02T08:00')
  await page.getByLabel('关联材料：沟通.png').check()
  await page.getByRole('button', { name: '添加时间线' }).click()

  await page.getByRole('textbox', { name: '摘要' }).fill('收到商品')
  await page.getByLabel('精确度').selectOption('date')
  await page.getByLabel('日期').fill('2026-07-03')
  await page.getByRole('button', { name: '添加时间线' }).click()

  await page.getByRole('textbox', { name: '摘要' }).fill('商家拒绝退款')
  await page.getByLabel('精确度').selectOption('unknown')
  await page.getByRole('button', { name: '添加时间线' }).click()

  for (const summary of ['下单', '发货', '收到商品', '商家拒绝退款']) {
    await page.getByRole('button', { name: `确认时间线：${summary}` }).click()
  }

  await page.reload()
  await expect(page.locator('li.timeline-item h2').first()).toBeVisible()
  const order = await page
    .locator('li.timeline-item h2')
    .allTextContents()
  expect(order).toEqual(['下单', '发货', '收到商品', '商家拒绝退款'])

  await page
    .locator('li.timeline-item')
    .filter({ hasText: '收到商品' })
    .getByRole('button', { name: '上移' })
    .click()

  await expect(page.getByText('时间顺序存在冲突')).toBeVisible()
  await expect(page.getByText('存在冲突，阻止导出')).toBeVisible()
})
