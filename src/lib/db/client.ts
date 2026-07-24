import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'
import { dbPath, dbUrl, ensureDataDir } from '@/lib/paths'

import { ensureSchema } from './migrate'

/**
 * One SQLite connection for the whole app, created on first use rather than at
 * import time. That matters twice over: `next build` imports every page module
 * to collect page data, and opening a native SQLite handle in a build worker
 * segfaults it; and tests need to point HUNT_DATA_DIR at a temp directory
 * without racing module evaluation.
 *
 * Cached on `globalThis` so Next's dev server doesn't leak a new client — and a
 * new file handle — on every HMR pass.
 */
const globalForPrisma = globalThis as unknown as { huntPrisma?: PrismaClient }

function createClient(): PrismaClient {
  ensureDataDir()
  // Applied before the first query so a fresh clone boots straight into a
  // working app — no separate migrate step for the person who just cloned it.
  ensureSchema(dbPath())

  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl() }) })
}

export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.huntPrisma
  if (existing) return existing

  const client = createClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.huntPrisma = client
  return client
}

/**
 * Call sites read as a plain client (`prisma.setting.findUnique(...)`); the
 * proxy defers construction to the first property access.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getPrisma(), property, receiver)
  },
})
