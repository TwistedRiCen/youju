import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const webPort = 4174
const apiPort = 3000
const baseURL = `http://127.0.0.1:${webPort}`

function releaseId(): string {
  let descriptor: unknown
  try {
    descriptor = JSON.parse(readFileSync('apps/web/dist/release.json', 'utf8'))
  } catch {
    throw new Error(
      'release.json is missing or unreadable; run `pnpm generate:release` after `pnpm build` first',
    )
  }
  const parsed = descriptor as { releaseId?: unknown }
  if (typeof parsed.releaseId !== 'string' || parsed.releaseId.length === 0) {
    throw new Error('release.json has no valid releaseId; run `pnpm generate:release` again')
  }
  return parsed.releaseId
}

export default defineConfig({
  testDir: './tests/e2e',
  // Only the release-candidate specs are meaningful against the built app;
  // dev-only specs import /src modules and dev server routes.
  testMatch: ['**/pwa-offline-update.spec.ts', '**/production-*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @youju/api exec tsx src/server.ts',
      env: {
        NODE_ENV: 'production',
        RELEASE_ID: releaseId(),
        TRUSTED_PROXY_CIDRS: '127.0.0.1',
        PORT: String(apiPort),
      },
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm serve:production-candidate',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
