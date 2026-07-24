import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll } from 'vitest'

/**
 * Every test file gets its own data directory — its own SQLite file and its own
 * generated secret key — so tests can't leak keys or state into each other, and
 * so a test run never touches the developer's real `./data`.
 *
 * This runs at module top level, NOT in `beforeAll`: `src/lib/db/client.ts`
 * resolves the database path when it is imported, and the test file's imports
 * are evaluated before any hook fires. Setting the env var in a hook would be
 * too late, and every test file would quietly share the real ./data/hunt.db.
 */
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-test-'))

process.env.HUNT_DATA_DIR = testDataDir
delete process.env.DATABASE_URL

const template = process.env.HUNT_TEST_TEMPLATE_DB
if (!template || !fs.existsSync(template)) {
  throw new Error(
    'hunt: test template DB missing — global setup did not run `prisma migrate deploy`.',
  )
}
fs.copyFileSync(template, path.join(testDataDir, 'hunt.db'))

afterAll(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true })
})
