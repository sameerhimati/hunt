import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

/**
 * hunt migrates itself on boot.
 *
 * The promise is `git clone && docker compose up` — or `npx hunt-app` — and a
 * working app. Requiring a separate `prisma migrate deploy` step would break
 * that, and shipping the Prisma CLI into the runtime image just to run one
 * command is a lot of weight for a single-user SQLite file. So we apply the
 * committed migration SQL directly and keep Prisma's own bookkeeping table in
 * sync, which leaves `prisma migrate` working normally for development.
 */

const BOOKKEEPING = `
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
`

function migrationsDir(): string {
  return path.join(process.cwd(), 'prisma', 'migrations')
}

/**
 * Splits a migration file into statements.
 *
 * Comment lines have to be stripped per line, not per statement: Prisma writes
 * `-- CreateTable` above every statement, so testing whether a chunk *starts*
 * with `--` silently discards the entire migration.
 */
function statements(sql: string): string[] {
  return sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((statement) => statement.length > 0)
}

export function ensureSchema(databasePath: string): void {
  const dir = migrationsDir()
  if (!fs.existsSync(dir)) {
    throw new Error(
      `hunt: no migrations found at ${dir}. The prisma/migrations directory must ship with the app.`,
    )
  }

  const pending = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // Migration directories are timestamp-prefixed, so lexical order is apply order.
    .sort()

  const db = new Database(databasePath)
  try {
    db.pragma('foreign_keys = ON')
    db.exec(BOOKKEEPING)

    const applied = new Set(
      db
        .prepare('SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL')
        .all()
        .map((row) => (row as { migration_name: string }).migration_name),
    )

    const record = db.prepare(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES (?, ?, current_timestamp, ?, ?)`,
    )

    for (const name of pending) {
      if (applied.has(name)) continue

      const file = path.join(dir, name, 'migration.sql')
      if (!fs.existsSync(file)) continue

      const sql = fs.readFileSync(file, 'utf8')
      const steps = statements(sql)

      // One transaction per migration: a half-applied schema is worse than none.
      db.transaction(() => {
        for (const statement of steps) db.exec(statement)
        record.run(
          crypto.randomUUID(),
          crypto.createHash('sha256').update(sql).digest('hex'),
          name,
          steps.length,
        )
      })()
    }
  } finally {
    db.close()
  }
}
