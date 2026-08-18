import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function dismissFirstUseGuide(page: Page): Promise<void> {
  // The guide mounts asynchronously after preferences load; wait for the
  // dialog or a short grace period, then dismiss it when present.
  const dialog = page.locator('dialog.guide-dialog')
  try {
    await dialog.waitFor({ state: 'visible', timeout: 1500 })
    await page.getByRole('button', { name: '跳过' }).click()
    await dialog.waitFor({ state: 'hidden' })
  } catch {
    // Guide already dismissed in this profile.
  }
}

async function createCase(page: Page): Promise<void> {
  await page.goto('/')
  await dismissFirstUseGuide(page)
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

test('blocks referenced material deletion and verifies whole-case deletion', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')

  await createCase(page)

  await page.getByRole('link', { name: '材料' }).click()
  await page.setInputFiles('input[type="file"]', [
    {
      name: 'order.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]),
    },
  ])
  await expect(page.getByRole('heading', { name: 'order.png' })).toBeVisible()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '事实' }).click()
  await page.getByRole('textbox', { name: '问题描述' }).fill('包裹破损')
  for (const label of ['购买时间', '商家名称', '商品名称', '实付金额（元）', '问题描述', '期望处理结果']) {
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
      const merchantDraft = aggregate?.factDrafts.find(
        (draft) => draft.fieldName === 'merchant_name',
      )
      const merchantFact = domain
        .selectCurrentConfirmedFacts(await repository.listConfirmedFacts(caseId))
        .find((fact) => fact.fieldName === 'merchant_name')
      const sourceRefs = (await repository.listEvidence(caseId)).map((evidence) => ({
        evidenceId: evidence.id,
      }))
      if (merchantDraft !== undefined && merchantFact !== undefined) {
        await repository.confirmFact({
          draftId: merchantDraft.id,
          confirmedFactId: crypto.randomUUID(),
          confirmedAt: new Date().toISOString(),
          sourceRefs,
          replacesFactId: merchantFact.id,
        })
      }
    }
    repository.close()
  })
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '材料' }).click()
  await page.getByRole('button', { name: '删除材料：order.png' }).click()
  await expect(page.getByText('该材料被正式内容引用，不能删除')).toBeVisible()
  await expect(page.getByText('确认事实')).toBeVisible()
  await page.getByRole('link', { name: '返回事件工作台' }).click()

  await page.getByRole('link', { name: '删除事件' }).click()
  await expect(page.getByRole('heading', { name: '删除本地事件' })).toBeVisible()
  await expect(page.getByText(/材料数量：1/)).toBeVisible()
  await expect(page.getByText(/已确认事实：6/)).toBeVisible()

  await page.getByLabel('输入事件标题以确认删除').fill('错误标题')
  await expect(page.getByRole('button', { name: '永久删除' })).toBeDisabled()
  await page.getByLabel('输入事件标题以确认删除').fill('运输破损退款纠纷')
  await page.getByRole('button', { name: '永久删除' }).click()

  await expect(page).toHaveURL(/\/$/)

  const result = await page.evaluate(async () => {
    const storageUrl = '/src/storage/index.ts'
    const storage = (await import(storageUrl)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        listCases(): Promise<readonly unknown[]>
        listOperations(): Promise<readonly unknown[]>
        close(): void
      }
      IndexedDbAiRepository: new (database: unknown) => {
        listAnalyses(caseId: string): Promise<readonly unknown[]>
        listCandidates(caseId: string): Promise<readonly unknown[]>
      }
    }
    const evidenceUrl = '/node_modules/@youju/evidence-store/src/index.ts'
    const evidenceModule = (await import(evidenceUrl)) as {
      OpfsEvidenceBlobStore: new () => {
        listCaseStorageRefs(caseId: string): Promise<readonly string[]>
        exists(storageRef: string): Promise<boolean>
      }
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const aiRepository = new storage.IndexedDbAiRepository(database)
    const blobStore = new evidenceModule.OpfsEvidenceBlobStore()
    const cases = await repository.listCases()
    const operations = await repository.listOperations()
    const tempExists = await blobStore.exists('temporary/00000000-0000-4000-8000-000000000000')
    const result = {
      caseCount: cases.length,
      operationCount: operations.length,
      tempExists,
      analysisCount: (await aiRepository.listAnalyses('00000000-0000-4000-8000-000000000001')).length,
      candidateCount: (await aiRepository.listCandidates('00000000-0000-4000-8000-000000000001')).length,
    }
    repository.close()
    return result
  })

  expect(result).toEqual({
    caseCount: 0,
    operationCount: 0,
    tempExists: false,
    analysisCount: 0,
    candidateCount: 0,
  })
})
