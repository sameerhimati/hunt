import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { ensureSchema } from '@/lib/db/migrate'

/**
 * `git clone && docker compose up` has to produce a working app, so booting
 * against an empty directory must build the whole schema unattended.
 */
function freshDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-migrate-'))
  created.push(dir)
  return path.join(dir, 'hunt.db')
}

const created: string[] = []

afterEach(() => {
  while (created.length) fs.rmSync(created.pop()!, { recursive: true, force: true })
})

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath)
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
  } finally {
    db.close()
  }
}

describe('ensureSchema', () => {
  it('builds the full schema in an empty database', () => {
    const dbPath = freshDbPath()
    ensureSchema(dbPath)

    const tables = tableNames(dbPath)
    // Every model in PLAN.md's data model must land, not just the first one.
    for (const model of [
      'Resume',
      'ResumeVersion',
      'Template',
      'Job',
      'Application',
      'Contact',
      'Outreach',
      'CheckResult',
      'SourcingRun',
      'Setting',
    ]) {
      expect(tables, `${model} table missing`).toContain(model)
    }
  })

  it('records what it applied in Prisma’s own bookkeeping table', () => {
    const dbPath = freshDbPath()
    ensureSchema(dbPath)

    const db = new Database(dbPath)
    try {
      const rows = db.prepare('SELECT migration_name, applied_steps_count FROM _prisma_migrations').all() as {
        migration_name: string
        applied_steps_count: number
      }[]

      expect(rows.length).toBeGreaterThan(0)
      // A migration recorded with zero steps means the SQL parsed to nothing —
      // the exact failure mode that let an empty schema look successful.
      for (const row of rows) {
        expect(row.applied_steps_count, `${row.migration_name} applied no statements`).toBeGreaterThan(0)
      }
    } finally {
      db.close()
    }
  })

  it('is idempotent — a second boot applies nothing and keeps the data', () => {
    const dbPath = freshDbPath()
    ensureSchema(dbPath)

    const countMigrations = () => {
      const db = new Database(dbPath)
      try {
        return (db.prepare('SELECT COUNT(*) AS n FROM _prisma_migrations').get() as { n: number }).n
      } finally {
        db.close()
      }
    }

    // Whatever is committed today — the point is that a second boot adds none.
    const firstBoot = countMigrations()
    expect(firstBoot).toBeGreaterThan(0)

    const db = new Database(dbPath)
    db.prepare('INSERT INTO Setting (key, value, encrypted, updatedAt) VALUES (?, ?, ?, ?)').run(
      'ui.theme',
      'dark',
      0,
      Date.now(),
    )
    db.close()

    expect(() => ensureSchema(dbPath)).not.toThrow()

    const after = new Database(dbPath)
    try {
      const row = after.prepare('SELECT value FROM Setting WHERE key = ?').get('ui.theme') as {
        value: string
      }
      expect(row.value).toBe('dark')
    } finally {
      after.close()
    }
    expect(countMigrations()).toBe(firstBoot)
  })
})
