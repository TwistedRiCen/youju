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

  await expect(page.getByLabel('商家名称')).toHaveValue('晴川生活示例店')
  await page.getByLabel('商家名称').fill('修改后的商家名称')
  await expect
    .poll(async () => {
      const input = page.getByLabel('商家名称')
      const current = await input.inputValue()
      if (current !== '修改后的商家名称') {
        await input.fill('修改后的商家名称')
      }
      return current === '修改后的商家名称'
    })
    .toBe(true)
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const url = '/src/storage/index.ts'
        const storage = (await import(url)) as {
          openYoujuDatabase: (migrations: readonly unknown[]) => Promise<{ version: number }>
          DATABASE_MIGRATIONS: readonly unknown[]
          IndexedDbCaseRepository: new (database: unknown) => {
            listCases(): Promise<readonly { caseEvent: { id: string } }[]>
            getCase(caseId: string): Promise<{
              factDrafts: readonly { fieldName: string; value: string }[]
            } | null>
            close(): void
          }
        }
        const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
        const repository = new storage.IndexedDbCaseRepository(database)
        const cases = await repository.listCases()
        const first = cases[0]
        const aggregate =
          first === undefined ? null : await repository.getCase(first.caseEvent.id)
        repository.close()
        return {
          databaseVersion: database.version,
          caseCount: cases.length,
          merchantValue:
            aggregate?.factDrafts.find((draft) => draft.fieldName === 'merchant_name')?.value ??
            null,
          formMerchantValue:
            (
              document.querySelector(
                '#draft-merchant_name',
              ) as HTMLInputElement | null
            )?.value ?? null,
          saveFailed: document.body.innerText.includes('保存失败，请重试'),
          saveConflict: document.body.innerText.includes('保存冲突'),
          navigationType:
            performance.getEntriesByType('navigation')[0]?.toJSON().type ?? 'unknown',
        }
      }),
    )
    .toMatchObject({
      databaseVersion: 2,
      caseCount: 1,
      merchantValue: '修改后的商家名称',
      formMerchantValue: '修改后的商家名称',
      saveFailed: false,
      saveConflict: false,
      navigationType: 'navigate',
    })

  await page.reload()
  await expect(page.getByLabel('商家名称')).toHaveValue('修改后的商家名称')
})
