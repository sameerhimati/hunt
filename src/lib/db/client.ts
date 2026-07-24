import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@/generated/prisma/client'
import { dbUrl, ensureDataDir } from '@/lib/paths'

/**
 * One SQLite connection for the whole app. Cached on `globalThis` so Next's dev
 * server doesn't leak a new client (and a new file handle) on every HMR pass.
 */
const globalForPrisma = globalThis as unknown as { huntPrisma?: PrismaClient }

function createClient(): PrismaClient {
  ensureDataDir()
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: dbUrl() }),
  })
}

export const prisma: PrismaClient = globalForPrisma.huntPrisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.huntPrisma = prisma
}
