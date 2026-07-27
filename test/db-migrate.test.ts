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

function migrationNames(): string[] {
  const dir = path.join(process.cwd(), 'prisma', 'migrations')
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/**
 * The state an install that predates a migration is actually in: the earlier
 * migrations applied and recorded, the newest one still pending.
 *
 * The suite otherwise always starts from an empty file and applies everything
 * at once, which is the one path where a backfill can never be observed —
 * there is nothing to back-fill. Every user upgrading in place takes this one.
 */
function applyThrough(dbPath: string, lastMigration: string): void {
  const dir = path.join(process.cwd(), 'prisma', 'migrations')
  const db = new Database(dbPath)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "checksum" TEXT NOT NULL,
          "finished_at" DATETIME,
          "migration_name" TEXT NOT NULL,
          "logs" TEXT,
          "rolled_back_at" DATETIME,
          "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
          "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      );
    `)

    const record = db.prepare(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES (?, ?, current_timestamp, ?, 1)`,
    )

    for (const name of migrationNames()) {
      db.exec(fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8'))
      record.run(`fixture-${name}`, 'fixture', name)
      if (name === lastMigration) return
    }
  } finally {
    db.close()
  }
}

/** Seeds one pipeline row directly, the way an older build would have written it. */
function seedApplication(
  dbPath: string,
  row: { id: string; status: string; decidedAt: number | null; updatedAt: number },
): void {
  const db = new Database(dbPath)
  try {
    db.prepare('INSERT INTO Job (id, title, company, jdText) VALUES (?, ?, ?, ?)').run(
      `job-${row.id}`,
      'Backend Engineer',
      'Acme',
      'JD',
    )
    db.prepare(
      `INSERT INTO Application (id, jobId, status, decidedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(row.id, `job-${row.id}`, row.status, row.decidedAt, row.updatedAt, row.updatedAt)
  } finally {
    db.close()
  }
}

function readApplication(dbPath: string, id: string): { offeredAt: number | null } {
  const db = new Database(dbPath)
  try {
    return db.prepare('SELECT offeredAt FROM Application WHERE id = ?').get(id) as {
      offeredAt: number | null
    }
  } finally {
    db.close()
  }
}

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

/**
 * Upgrading in place, which is the path every existing install takes and the
 * one the rest of this suite structurally cannot see: it always starts from an
 * empty file and applies every migration at once, so a row can never predate a
 * column. `offeredAt` arrived after the funnel started counting offers off it,
 * which makes the backfill part of the migration's contract, not a nicety.
 */
describe('ensureSchema — upgrading a database that already has rows', () => {
  const INIT = '20260724080240_init'
  const OFFERED_AT = '20260725174749_application_offered_at'
  const DECIDED = Date.UTC(2026, 6, 1)
  const TOUCHED = Date.UTC(2026, 6, 20)

  it('is a real partial upgrade — the column under test is genuinely absent first', () => {
    const dbPath = freshDbPath()
    applyThrough(dbPath, INIT)

    const db = new Database(dbPath)
    try {
      const columns = db
        .prepare('SELECT name FROM pragma_table_info(?)')
        .all('Application')
        .map((row) => (row as { name: string }).name)
      expect(columns).not.toContain('offeredAt')
    } finally {
      db.close()
    }

    expect(migrationNames()).toContain(OFFERED_AT)
  })

  it('stamps an offer that predates the column, so the funnel and the board agree', () => {
    const dbPath = freshDbPath()
    applyThrough(dbPath, INIT)
    seedApplication(dbPath, {
      id: 'sitting-in-offer',
      status: 'offer',
      decidedAt: DECIDED,
      updatedAt: TOUCHED,
    })

    ensureSchema(dbPath)

    // Without the backfill this reads null, and the dashboard prints "Offer: 0"
    // for a card the pipeline list is showing under Offer.
    expect(readApplication(dbPath, 'sitting-in-offer').offeredAt).toBe(DECIDED)
  })

  it('falls back to updatedAt when the old row never recorded a decision', () => {
    const dbPath = freshDbPath()
    applyThrough(dbPath, INIT)
    seedApplication(dbPath, {
      id: 'offer-without-decision',
      status: 'offer',
      decidedAt: null,
      updatedAt: TOUCHED,
    })

    ensureSchema(dbPath)

    expect(readApplication(dbPath, 'offer-without-decision').offeredAt).toBe(TOUCHED)
  })

  it('refuses to invent an offer for a rejection, which may never have had one', () => {
    const dbPath = freshDbPath()
    applyThrough(dbPath, INIT)
    // The old schema wrote `decidedAt` for a declined offer and for a plain
    // rejection alike. Nothing on the row tells them apart, so nothing is claimed.
    seedApplication(dbPath, {
      id: 'decided-rejection',
      status: 'rejected',
      decidedAt: DECIDED,
      updatedAt: TOUCHED,
    })
    seedApplication(dbPath, {
      id: 'still-interviewing',
      status: 'interview',
      decidedAt: null,
      updatedAt: TOUCHED,
    })

    ensureSchema(dbPath)

    expect(readApplication(dbPath, 'decided-rejection').offeredAt).toBeNull()
    expect(readApplication(dbPath, 'still-interviewing').offeredAt).toBeNull()
  })

  it('still applies cleanly to a fresh database, where there is nothing to backfill', () => {
    const dbPath = freshDbPath()
    expect(() => ensureSchema(dbPath)).not.toThrow()

    const db = new Database(dbPath)
    try {
      const row = db
        .prepare('SELECT applied_steps_count AS steps FROM _prisma_migrations WHERE migration_name = ?')
        .get(OFFERED_AT) as { steps: number }
      // Column plus backfill: a count of 1 means the UPDATE was dropped on the floor.
      expect(row.steps).toBe(2)
    } finally {
      db.close()
    }
  })
})
