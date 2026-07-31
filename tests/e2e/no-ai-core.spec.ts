import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const fixtureDirectory = new URL(
  '../../fixtures/ecommerce-refund/case-001-transport-damage/',
  import.meta.url,
)
const manifest = JSON.parse(
  readFileSync(new URL('manifest.json', fixtureDirectory), 'utf8'),
) as {
  binaryEvidence: readonly {
    evidenceId: string
    relativePath: string
    mediaType: string
    size: number
    sha256: string
  }[]
}

const binaryFiles = manifest.binaryEvidence.map((binary) => ({
  ...binary,
  name: binary.relativePath.split('/').at(-1) ?? binary.relativePath,
  buffer: readFileSync(new URL(binary.relativePath, fixtureDirectory)),
}))

const categoryByEvidence: Readonly<Record<string, string>> = {
  '00000000-0000-4000-8000-000000000101': 'order_record',
  '00000000-0000-4000-8000-000000000102': 'payment_record',
  '00000000-0000-4000-8000-000000000103': 'product_issue_photo',
  '00000000-0000-4000-8000-000000000104': 'merchant_communication',
}

const timelineEntries = [
  { summary: '用户下单并完成付款', time: '2026-07-01T12:16', sources: [0, 1] },
  { summary: '用户收货并发现运输破损', time: '2026-07-03T06:30', sources: [2] },
  { summary: '用户请求退货退款', time: '2026-07-03T07:15', sources: [3] },
  { summary: '商家拒绝退货退款', time: '2026-07-03T08:00', sources: [3] },
]

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

test('completes the full no-AI golden workflow', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')

  await createCase(page)
  const caseIdFromUrl = new URL(page.url()).pathname.split('/')[2] ?? ''

  await page.getByRole('link', { name: '材料' }).click()
  await page.setInputFiles(
    'input[type="file"]',
    binaryFiles.map((file) => ({
      name: file.name,
      mimeType: file.mediaType,
      buffer: file.buffer,
    })),
  )
  for (const file of binaryFiles) {
    await expect(page.getByRole('heading', { name: file.name })).toBeVisible()
  }

  await page.reload()
  for (const file of binaryFiles) {
    await expect(page.getByRole('heading', { name: file.name })).toBeVisible()
  }

  for (const file of binaryFiles) {
    await page
      .getByLabel(`分类：${file.name}`)
      .selectOption(categoryByEvidence[file.evidenceId] ?? 'other')
  }
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '事实' }).click()
  await page
    .getByRole('textbox', { name: '问题描述' })
    .fill('包裹外箱凹陷，桌板边角开裂并有明显压痕')
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
        facts: readonly { id: string; fieldName: string }[],
      ) => readonly { id: string; fieldName: string }[]
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const cases = await repository.listCases()
    const first = cases[0]
    if (first !== undefined) {
      const caseId = first.caseEvent.id
      const aggregate = await repository.getCase(caseId)
      const drafts = aggregate?.factDrafts ?? []
      const sourceRefs = (await repository.listEvidence(caseId)).map((evidence) => ({
        evidenceId: evidence.id,
      }))
      const required = new Set([
        'purchase_time',
        'merchant_name',
        'product_name',
        'paid_amount',
      ])
      for (const fact of domain.selectCurrentConfirmedFacts(
        await repository.listConfirmedFacts(caseId),
      )) {
        if (!required.has(fact.fieldName)) {
          continue
        }
        const draft = drafts.find((item) => item.fieldName === fact.fieldName)
        if (draft !== undefined) {
          await repository.confirmFact({
            draftId: draft.id,
            confirmedFactId: crypto.randomUUID(),
            confirmedAt: new Date().toISOString(),
            sourceRefs,
            replacesFactId: fact.id,
          })
        }
      }
    }
    repository.close()
  })
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '时间线' }).click()
  for (const entry of timelineEntries) {
    await page.getByRole('textbox', { name: '摘要' }).fill(entry.summary)
    await page.getByRole('textbox', { name: '时间' }).fill(entry.time)
    for (const sourceIndex of entry.sources) {
      const source = binaryFiles[sourceIndex]
      if (source !== undefined) {
        await page.getByLabel(`关联材料：${source.name}`).check()
      }
    }
    await page.getByRole('button', { name: '添加时间线' }).click()
  }
  for (const entry of timelineEntries) {
    await page.getByRole('button', { name: `确认时间线：${entry.summary}` }).click()
  }
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '缺口检查' }).click()
  await expect(page.getByText('没有发现缺口。')).toBeVisible()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '陈述' }).click()
  await page.getByRole('button', { name: '生成事实陈述' }).click()
  await page
    .getByLabel('事实陈述内容')
    .fill(`${await page.getByLabel('事实陈述内容').inputValue()}\n补充说明：以上内容由用户本人确认。`)
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('button', { name: '确认陈述' }).click()
  await expect(page.getByText('陈述已确认')).toBeVisible()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '导出' }).click()
  const exportButton = page.getByRole('button', { name: '生成材料包' })
  await expect(exportButton).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const archive = unzipSync(new Uint8Array(readFileSync(downloadPath!)))
  const suggestedName = download.suggestedFilename()
  const directory = suggestedName.slice(0, -4)

  for (let index = 0; index < manifest.binaryEvidence.length; index += 1) {
    const binary = manifest.binaryEvidence[index]
    if (binary === undefined) {
      continue
    }
    const baseName = binary.relativePath.replace('binary/', '')
    const entryName = `${String(index + 1).padStart(3, '0')}_${baseName}`
    const entry = archive[`${directory}/06_原始材料/${entryName}`]
    expect(entry).toBeDefined()
    expect(createHash('sha256').update(entry!).digest('hex')).toBe(binary.sha256)
  }

  await page.getByRole('link', { name: '返回事件工作台' }).click()
  await page.getByRole('link', { name: '删除事件' }).click()
  await page.getByLabel('输入事件标题以确认删除').fill('运输破损退款纠纷')
  await page.getByRole('button', { name: '永久删除' }).click()
  await expect(page).toHaveURL(/\/$/)

  const residue = await page.evaluate(async (deletedCaseId) => {
    const storageUrl = '/src/storage/index.ts'
    const storage = (await import(storageUrl)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        listCases(): Promise<readonly unknown[]>
        listOperations(): Promise<readonly unknown[]>
        close(): void
      }
    }
    const evidenceUrl = '/node_modules/@youju/evidence-store/src/index.ts'
    const evidenceModule = (await import(evidenceUrl)) as {
      OpfsEvidenceBlobStore: new () => {
        listCaseStorageRefs(caseId: string): Promise<readonly string[]>
      }
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const blobStore = new evidenceModule.OpfsEvidenceBlobStore()
    const caseCount = (await repository.listCases()).length
    const operationCount = (await repository.listOperations()).length
    const blobRefs = await blobStore.listCaseStorageRefs(deletedCaseId)
    repository.close()
    return { caseCount, operationCount, blobRefCount: blobRefs.length }
  }, caseIdFromUrl)
  expect(residue).toEqual({ caseCount: 0, operationCount: 0, blobRefCount: 0 })
})
