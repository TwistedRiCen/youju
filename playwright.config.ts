import { defineConfig, devices } from '@playwright/test'

const webPort = 4173
const baseURL = `http://127.0.0.1:${webPort}`

export default defineConfig({
  testDir: './tests/e2e',
  // The production Service Worker and release-candidate specs require the
  // built app served by vite preview / the candidate server; they run only
  // via playwright.production.config.ts.
  testIgnore: ['**/pwa-offline-update.spec.ts', '**/production-*.spec.ts'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: `pnpm --filter @youju/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
