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

test('shows rule findings, confirms a statement, and invalidates it after fact replacement', async ({
  page,
}) => {
  await createCase(page)
  await page.getByRole('link', { name: '缺口检查' }).click()
  await expect(page.getByRole('heading', { name: '缺口检查' })).toBeVisible()
  await expect(page.getByText('缺少必填事实：purchase_time')).toBeVisible()
  await expect(page.getByText('缺少必填事实：merchant_name')).toBeVisible()
  await expect(page.getByText('建议补充：订单记录')).toBeVisible()
  await expect(page.getByText('建议补充：商家沟通记录')).toBeVisible()

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
  await expect(page.getByText('paid_amount：89900（版本 1）')).toBeVisible()

  await page.getByRole('link', { name: '返回事件工作台' }).click()
  await page.getByRole('link', { name: '陈述' }).click()
  await expect(page.getByRole('heading', { name: '事实陈述' })).toBeVisible()
  await page.getByRole('button', { name: '生成事实陈述' }).click()
  await expect(page.getByText('晴川生活示例店')).toBeVisible()
  await page.getByRole('button', { name: '确认陈述' }).click()
  await expect(page.getByText('陈述已确认')).toBeVisible()

  await page.getByRole('link', { name: '返回事件工作台' }).click()
  await page.getByRole('link', { name: '事实' }).click()
  await page.getByRole('textbox', { name: '商家名称' }).fill('修改后的商家名称')
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const storageUrl = '/src/storage/index.ts'
        const storage = (await import(storageUrl)) as {
          openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
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
        return (
          aggregate?.factDrafts.find((draft) => draft.fieldName === 'merchant_name')?.value ??
          null
        )
      }),
    )
    .toBe('修改后的商家名称')
  await page.getByRole('button', { name: '确认事实：商家名称' }).click()

  await page.getByRole('link', { name: '返回事件工作台' }).click()
  await page.getByRole('link', { name: '陈述' }).click()
  await expect(page.getByText('内容已过期，请重新确认')).toBeVisible()
})
