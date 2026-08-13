import { expect, test } from '@playwright/test'

test.describe('Mock-only BYOK AI errors', () => {
  test('keeps the manual app available after a mocked provider error', async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (!new URL(route.request().url()).pathname.startsWith('/ai/')) {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'provider_auth_failed' } }),
      })
    })
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const response = await fetch('/ai/connection-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      return { status: response.status, body: await response.json() as { error?: { code?: string } } }
    })
    expect(result).toEqual({ status: 401, body: { error: { code: 'provider_auth_failed' } } })
    expect(await page.evaluate(() => document.querySelector('#app') !== null)).toBe(true)
  })

  test('normalizes capability, rate, quota, timeout, output, repair, and cancellation errors', async ({ page }) => {
    const statuses: Readonly<Record<string, number>> = {
      provider_capability_missing: 400,
      provider_rate_limited: 429,
      provider_quota_exceeded: 402,
      provider_timeout: 504,
      invalid_structured_output: 502,
      repair_failed: 502,
      request_cancelled: 499,
    }
    await page.route('**/*', async (route) => {
      if (!new URL(route.request().url()).pathname.startsWith('/ai/')) {
        await route.continue()
        return
      }
      const code = new URL(route.request().url()).searchParams.get('error') ?? 'provider_unreachable'
      await route.fulfill({ status: statuses[code] ?? 502, contentType: 'application/json', body: JSON.stringify({ error: { code } }) })
    })
    await page.goto('/')
    const result = await page.evaluate(async (expectedStatuses) => {
      const outputs = []
      for (const code of Object.keys(expectedStatuses)) {
        const response = await fetch(`/ai/connection-test?error=${code}`, { method: 'POST', body: '{}' })
        outputs.push({ code, status: response.status, body: (await response.json() as { error?: { code?: string } }).error?.code })
      }
      return outputs
    }, statuses)
    expect(result).toEqual(Object.entries(statuses).map(([code, status]) => ({ code, status, body: code })))
    await page.reload()
    expect(await page.evaluate(() => document.querySelector('#app') !== null)).toBe(true)
  })

  test('stops a mid-sequence failure while preserving the local manual surface', async ({ page }) => {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (!url.pathname.startsWith('/ai/')) {
        await route.continue()
        return
      }
      if (url.pathname.endsWith('/classify_evidence')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ taskType: 'classify_evidence', output: { classifications: [], warnings: [] } }) })
        return
      }
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'provider_rate_limited' } }) })
    })
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const statuses = []
      for (const taskType of ['classify_evidence', 'extract_facts', 'build_timeline']) {
        const response = await fetch(`/ai/tasks/${taskType}`, { method: 'POST', body: JSON.stringify({ manifest: { taskType } }) })
        statuses.push(response.status)
        if (!response.ok) break
      }
      return statuses
    })
    expect(result).toEqual([200, 429])
    expect(await page.evaluate(() => document.querySelector('#app') !== null)).toBe(true)
  })
})
