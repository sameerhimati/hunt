import { defineConfig } from '@playwright/test'

import base from './playwright.config'

/**
 * Runner for the phase exit-gate e2e specs (gates/e2e/phase-N). Same
 * production server and isolated data dir as the main e2e suite, plus
 * HUNT_TEST_MODE=1 — the app serves fixture-backed Fake* adapters and the
 * scripted FakeLlmProvider, so gates need no keys and no network.
 */
const webServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer

export default defineConfig({
  ...base,
  testDir: './gates/e2e',
  testMatch: '**/*.gate.spec.ts',
  webServer: {
    ...webServer!,
    env: { ...webServer!.env, HUNT_TEST_MODE: '1' },
  },
})
