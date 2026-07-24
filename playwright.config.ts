import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against a production build on port 3100 with an isolated data
 * directory, so it never touches the developer's real `./data/hunt.db`.
 */
const PORT = 3100

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      HUNT_DATA_DIR: './.e2e-data',
      NODE_ENV: 'production',
    },
  },
})
