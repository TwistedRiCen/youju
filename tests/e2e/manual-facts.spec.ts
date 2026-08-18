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

test('confirms six facts and keeps replacement history', async ({ page }) => {
  await createCase(page)
  await page.getByRole('link', { name: '事实' }).click()
  await expect(page.getByRole('heading', { name: '事实确认' })).toBeVisible()
  await expect(page.getByText('正式导出前必须关联材料')).toHaveCount(4)

  await page.getByRole('textbox', { name: '问题描述' }).fill('包裹外箱凹陷，桌板边角开裂')
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const url = '/src/storage/index.ts'
        const storage = (await import(url)) as {
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
          aggregate?.factDrafts.find((draft) => draft.fieldName === 'problem_description')
            ?.value ?? null
        )
      }),
    )
    .toBe('包裹外箱凹陷，桌板边角开裂')

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

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const domainUrl = '/node_modules/@youju/domain/src/index.ts'
        const domain = (await import(domainUrl)) as {
          selectCurrentConfirmedFacts: (
            facts: readonly { fieldName: string; version: number; value: string }[],
          ) => readonly { fieldName: string; version: number; value: string }[]
        }
        const storageUrl = '/src/storage/index.ts'
        const storage = (await import(storageUrl)) as {
          openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
          DATABASE_MIGRATIONS: readonly unknown[]
          IndexedDbCaseRepository: new (database: unknown) => {
            listCases(): Promise<readonly { caseEvent: { id: string } }[]>
            listConfirmedFacts(caseId: string): Promise<
              readonly { fieldName: string; version: number; value: string }[]
            >
            close(): void
          }
        }
        const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
        const repository = new storage.IndexedDbCaseRepository(database)
        const cases = await repository.listCases()
        const first = cases[0]
        const all = first === undefined ? [] : await repository.listConfirmedFacts(first.caseEvent.id)
        repository.close()
        return domain.selectCurrentConfirmedFacts(all).length
      }),
    )
    .toBe(6)

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

  const result = await page.evaluate(async () => {
    const domainUrl = '/node_modules/@youju/domain/src/index.ts'
    const domain = (await import(domainUrl)) as {
      selectCurrentConfirmedFacts: (
        facts: readonly { fieldName: string; version: number; value: string }[],
      ) => readonly { fieldName: string; version: number; value: string }[]
    }
    const storageUrl = '/src/storage/index.ts'
    const storage = (await import(storageUrl)) as {
      openYoujuDatabase: (migrations: readonly unknown[]) => Promise<unknown>
      DATABASE_MIGRATIONS: readonly unknown[]
      IndexedDbCaseRepository: new (database: unknown) => {
        listCases(): Promise<readonly { caseEvent: { id: string } }[]>
        listConfirmedFacts(caseId: string): Promise<
          readonly { fieldName: string; version: number; value: string }[]
        >
        close(): void
      }
    }
    const database = await storage.openYoujuDatabase(storage.DATABASE_MIGRATIONS)
    const repository = new storage.IndexedDbCaseRepository(database)
    const cases = await repository.listCases()
    const first = cases[0]
    const all =
      first === undefined ? [] : await repository.listConfirmedFacts(first.caseEvent.id)
    repository.close()
    const merchantHistory = all.filter((fact) => fact.fieldName === 'merchant_name')
    const current = domain.selectCurrentConfirmedFacts(all)
    const merchantCurrent = current.find((fact) => fact.fieldName === 'merchant_name')
    return {
      historyCount: merchantHistory.length,
      historyVersions: merchantHistory.map((fact) => fact.version).sort(),
      currentMerchantVersion: merchantCurrent?.version ?? null,
      currentMerchantValue: merchantCurrent?.value ?? null,
      currentCount: current.length,
    }
  })

  expect(result).toEqual({
    historyCount: 2,
    historyVersions: [1, 2],
    currentMerchantVersion: 2,
    currentMerchantValue: '修改后的商家名称',
    currentCount: 6,
  })
})
