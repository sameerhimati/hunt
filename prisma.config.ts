import path from 'node:path'
import { defineConfig } from 'prisma/config'

// Kept deliberately dependency-free: the Prisma CLI loads this file outside the
// Next.js build, so it can't rely on `@/` path aliases. The same resolution
// lives in `src/lib/paths.ts` for the app runtime.
const dataDir = path.resolve(process.cwd(), process.env.HUNT_DATA_DIR ?? './data')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? `file:${path.join(dataDir, 'hunt.db')}`,
  },
})
