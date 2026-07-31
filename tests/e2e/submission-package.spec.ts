import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const orderBytes = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x07, 0x08,
]
const paymentBytes = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16,
  0x17, 0x18,
]
const orderHash = createHash('sha256').update(Buffer.from(orderBytes)).digest('hex')
const paymentHash = createHash('sha256').update(Buffer.from(paymentBytes)).digest('hex')

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

test('exports a complete submission package with verified attachments', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')

  await createCase(page)

  await page.getByRole('link', { name: '材料' }).click()
  await page.setInputFiles('input[type="file"]', [
    { name: 'order.png', mimeType: 'image/png', buffer: Buffer.from(orderBytes) },
    { name: 'payment.png', mimeType: 'image/png', buffer: Buffer.from(paymentBytes) },
  ])
  await expect(page.getByRole('heading', { name: 'order.png' })).toBeVisible()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '事实' }).click()
  await page.getByRole('textbox', { name: '问题描述' }).fill('包裹外箱凹陷，桌板边角开裂')
  for (const label of [
    '购买时间',
    '商家名称',
    '商品名称',
    '实付金额（元）',
    '问题描述',
    '期望处理结果',
  ]) {
    await page.getByRole('button', { name: `确认事实：${label}` }).click()
  }
  await page.evaluate(async () => {
    const storageUrl = '/src/storage/index.ts'
    const storage = (await import(storageUrl)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        listCases(): Promise<readonly { caseEvent: { id: string } }[]>
        getCase(caseId: string): Promise<{
          factDrafts: readonly { id: string; fieldName: string }[]
        } | null>
        listEvidence(caseId: string): Promise<readonly { id: string }[]>
        listConfirmedFacts(caseId: string): Promise<
          readonly { id: string; fieldName: string; replacesFactId: string | null }[]
        >
        confirmFact(command: Record<string, unknown>): Promise<unknown>
        close(): void
      }
    }
    const domainUrl = '/node_modules/@youju/domain/src/index.ts'
    const domain = (await import(domainUrl)) as {
      selectCurrentConfirmedFacts: (
        facts: readonly { id: string; fieldName: string; replacesFactId: string | null }[],
      ) => readonly { id: string; fieldName: string }[]
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const cases = await repository.listCases()
    const first = cases[0]
    if (first === undefined) {
      repository.close()
      return
    }
    const caseId = first.caseEvent.id
    const aggregate = await repository.getCase(caseId)
    const drafts = aggregate?.factDrafts ?? []
    const currentFacts = domain.selectCurrentConfirmedFacts(
      await repository.listConfirmedFacts(caseId),
    )
    const sourceRefs = (await repository.listEvidence(caseId)).map((evidence) => ({
      evidenceId: evidence.id,
    }))
    const sourceRequiredFields = new Set([
      'purchase_time',
      'merchant_name',
      'product_name',
      'paid_amount',
    ])
    for (const fact of currentFacts) {
      if (!sourceRequiredFields.has(fact.fieldName)) {
        continue
      }
      const draft = drafts.find((item) => item.fieldName === fact.fieldName)
      if (draft === undefined) {
        continue
      }
      await repository.confirmFact({
        draftId: draft.id,
        confirmedFactId: crypto.randomUUID(),
        confirmedAt: new Date().toISOString(),
        sourceRefs,
        replacesFactId: fact.id,
      })
    }
    repository.close()
  })
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '时间线' }).click()
  await page.getByRole('textbox', { name: '摘要' }).fill('下单')
  await page.getByRole('textbox', { name: '时间' }).fill('2026-07-01T12:16')
  await page.getByRole('button', { name: '添加时间线' }).click()
  await page.getByRole('button', { name: '确认时间线：下单' }).click()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '陈述' }).click()
  await page.getByRole('button', { name: '生成事实陈述' }).click()
  await page.getByRole('button', { name: '确认陈述' }).click()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '导出' }).click()
  await expect(page.getByRole('heading', { name: '导出材料包' })).toBeVisible()
  await expect(page.getByText('材料包未加密，可能包含敏感个人信息')).toBeVisible()
  const exportButton = page.getByRole('button', { name: '生成材料包' })
  await expect(exportButton).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const suggestedName = download.suggestedFilename()
  expect(suggestedName.endsWith('.zip')).toBe(true)
  const directory = suggestedName.slice(0, -4)
  const archive = unzipSync(new Uint8Array(readFileSync(downloadPath!)))
  const entryNames = Object.keys(archive).sort()

  expect(entryNames).toEqual(
    [
      `${directory}/01_事件说明.pdf`,
      `${directory}/02_事件时间线.pdf`,
      `${directory}/03_证据材料清单.pdf`,
      `${directory}/04_材料摘要校验表.csv`,
      `${directory}/05_附件索引.html`,
      `${directory}/06_原始材料/001_order.png`,
      `${directory}/06_原始材料/002_payment.png`,
    ].sort(),
  )

  const orderEntry = new Uint8Array(archive[`${directory}/06_原始材料/001_order.png`]!)
  const paymentEntry = new Uint8Array(archive[`${directory}/06_原始材料/002_payment.png`]!)
  expect(orderEntry).toEqual(new Uint8Array(orderBytes))
  expect(paymentEntry).toEqual(new Uint8Array(paymentBytes))
  expect(createHash('sha256').update(orderEntry).digest('hex')).toBe(orderHash)
  expect(createHash('sha256').update(paymentEntry).digest('hex')).toBe(paymentHash)

  const statementPdf = new Uint8Array(archive[`${directory}/01_事件说明.pdf`]!)
  expect(statementPdf.length).toBeGreaterThan(1000)
})
