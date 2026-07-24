import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Migrating a SQLite file costs a Prisma CLI subprocess (~1s), so we pay it
 * once: build a template DB here, and let each test file copy it. That keeps
 * per-file isolation cheap enough to be the default.
 */
export default function globalSetup() {
  const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-test-template-'))

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, HUNT_DATA_DIR: templateDir },
    stdio: 'pipe',
  })

  process.env.HUNT_TEST_TEMPLATE_DB = path.join(templateDir, 'hunt.db')

  return () => {
    fs.rmSync(templateDir, { recursive: true, force: true })
  }
}
