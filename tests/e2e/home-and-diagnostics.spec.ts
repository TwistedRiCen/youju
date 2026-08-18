import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const hasNoHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )

  expect(hasNoHorizontalOverflow).toBe(true)
}

test('home communicates the product boundary without login fields', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: '有据' })).toBeVisible()
  await expect(page.getByText('整理事实与材料，不替你作法律判断')).toBeVisible()
  await expect(page.getByText('无需注册；无需 AI 也能完成核心流程')).toBeVisible()
  await expect(
    page.locator(
      'input[type="tel"], input[type="password"], input[autocomplete="tel"], input[autocomplete="username"]',
    ),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /登录|注册/ })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('development diagnostics exposes only the fictional fixture summary', async ({ page }) => {
  await page.goto('/dev/diagnostics')

  await expect(page.getByRole('heading', { level: 1, name: '黄金案例诊断' })).toBeVisible()
  await expect(page.getByText('case-001-transport-damage')).toBeVisible()
  await expect(page.getByText('材料数量：4')).toBeVisible()
  await expect(page.getByText('已确认事实：6')).toBeVisible()
  await expect(page.getByText('时间线条目：4')).toBeVisible()
  await expect(page.getByText('规则校验：通过')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
