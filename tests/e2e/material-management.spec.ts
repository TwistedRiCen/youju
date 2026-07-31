import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const pngOne = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08,
]
const pngTwo = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
  0x18,
]
const pdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0x01, 0x02, 0x03]

const hashOne = createHash('sha256').update(Buffer.from(pngOne)).digest('hex')
const hashTwo = createHash('sha256').update(Buffer.from(pngTwo)).digest('hex')

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

test('imports valid materials, rejects mismatched files, and persists categories', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')
  await createCase(page)
  await page.getByRole('link', { name: '材料' }).click()
  await expect(page.getByRole('heading', { name: '材料管理' })).toBeVisible()

  await page.setInputFiles('input[type="file"]', [
    { name: '材料一.png', mimeType: 'image/png', buffer: Buffer.from(pngOne) },
    { name: '材料二.png', mimeType: 'image/png', buffer: Buffer.from(pngTwo) },
    { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from(pdfBytes) },
  ])

  await expect(page.getByText('bad.png：文件扩展名、类型与内容不一致')).toBeVisible()
  await expect(page.getByRole('heading', { name: '材料一.png' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '材料二.png' })).toBeVisible()
  await expect(page.getByText(`SHA-256：${hashOne}`)).toBeVisible()
  await expect(page.getByText(`SHA-256：${hashTwo}`)).toBeVisible()
  await expect(page.getByText('大小：16 字节')).toHaveCount(2)
  await expect(page.locator('li.evidence-item')).toHaveCount(2)

  await page.getByLabel('分类：材料一.png').selectOption('payment_record')
  await page.reload()
  await expect(page.getByLabel('分类：材料一.png')).toHaveValue('payment_record')
})

test('degrades to structured editing when OPFS is unavailable', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, 'getDirectory', {
      configurable: true,
      get: () => undefined,
    })
  })
  const page = await context.newPage()
  await createCase(page)
  const caseId = new URL(page.url()).pathname.split('/')[2] ?? ''

  await page.getByRole('link', { name: '材料' }).click()
  await expect(page.getByText('当前浏览器不能可靠保存原始材料')).toBeVisible()
  await expect(page.locator('input[type="file"]')).toHaveCount(0)

  const evidenceCount = await page.evaluate(async (caseIdentifier) => {
    const url = '/src/storage/index.ts'
    const storage = (await import(url)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        listEvidence(caseIdentifier: string): Promise<readonly unknown[]>
      }
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    return (await repository.listEvidence(caseIdentifier)).length
  }, caseId)

  expect(evidenceCount).toBe(0)
  await context.close()
})
