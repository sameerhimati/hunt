import { defineConfig } from '@playwright/test'

import base from './playwright.config'

/**
 * Runner for the phase exit-gate e2e specs (gates/e2e/phase-N). Same production
 * build as the main e2e suite, plus HUNT_TEST_MODE=1 — the app serves
 * fixture-backed Fake* adapters and the scripted FakeLlmProvider, so gates need
 * no keys and no network.
 *
 * **Two servers, and the second one is the point.** Every phase gate shares one
 * app and one database, which is fine while they are all asserting pieces of a
 * working install. The phase-8 golden path is not that: its subject is a
 * stranger meeting a machine with nothing on it, so it needs a database nobody
 * has touched — and, having walked the entire product end to end, it leaves
 * behind a résumé, an application, a contact and a sent message that the
 * narrower gates then trip over. Sharing made it both unable to start clean and
 * unsafe to run first. It gets its own machine, which is what it is testing.
 */
const PORT = 3100
const FIRST_RUN_PORT = 3101

const webServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer

/** One `next start` per data directory, each wiped immediately before it boots. */
function server(port: number, dataDir: string) {
  return {
    ...webServer!,
    command: `node e2e/reset-data.mjs ${dataDir} && pnpm exec next start --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    env: { ...webServer!.env, HUNT_TEST_MODE: '1', HUNT_DATA_DIR: `./${dataDir}` },
  }
}

export default defineConfig({
  ...base,
  testDir: '.',
  webServer: [server(PORT, '.e2e-data'), server(FIRST_RUN_PORT, '.e2e-data-firstrun')],
  projects: [
    {
      // The cold machine. No dependency, its own server, nothing before it.
      name: 'first-run',
      testDir: './gates/e2e/phase-8',
      testMatch: '**/golden-path.gate.spec.ts',
      use: { ...base.use, baseURL: `http://127.0.0.1:${FIRST_RUN_PORT}` },
    },
    {
      name: 'setup',
      testDir: './gates/setup',
      testMatch: '**/*.setup.ts',
      use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
    },
    {
      name: 'gates',
      testDir: './gates/e2e',
      testMatch: '**/*.gate.spec.ts',
      testIgnore: '**/phase-8/golden-path.gate.spec.ts',
      dependencies: ['setup'],
      use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
    },
  ],
})
