import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll } from 'vitest'

/**
 * Every test file gets its own data directory — its own SQLite file and its own
 * generated secret key — so tests can't leak keys or state into each other, and
 * so a test run never touches the developer's real `./data`.
 *
 * No migration step here: the app builds its own schema on first query, which
 * means the suite exercises the same first-boot path a fresh clone takes.
 */
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-test-'))

process.env.HUNT_DATA_DIR = testDataDir
delete process.env.DATABASE_URL

afterAll(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true })
})
