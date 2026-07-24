import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Runner for the phase exit-gate tests (gates/unit/phase-N). Gates are
 * committed RED before their phase exists, so `gates/` is excluded from tsc
 * and eslint — this config verifies them at runtime only. The `@` alias is
 * pinned here explicitly because the root tsconfig excludes gates/.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['gates/unit/**/*.gate.test.ts'],
    // Render gates shell out to Tectonic; first run may download the binary.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
