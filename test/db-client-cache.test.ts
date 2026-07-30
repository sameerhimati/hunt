import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getPrisma } from '@/lib/db/client'

/**
 * The client must be constructed once per process, in production above all.
 *
 * It used to skip the `globalThis` cache when `NODE_ENV === 'production'` —
 * the standard Next idiom, which is correct only when a module-level `const`
 * holds the singleton. This client is built lazily behind a proxy instead (so
 * `next build` workers don't segfault on a native handle), so that branch
 * memoised nothing: every property access on `prisma` re-scanned the whole
 * migrations tree and opened another SQLite handle that was never closed.
 *
 * `pnpm dev` sets NODE_ENV=development, which is why nobody saw it. This pins
 * the production path specifically.
 */

const globalForPrisma = globalThis as unknown as { huntPrisma?: unknown }

let previousEnv: string | undefined

beforeEach(() => {
  previousEnv = process.env.NODE_ENV
  delete globalForPrisma.huntPrisma
})

afterEach(() => {
  if (previousEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV
  else (process.env as Record<string, string | undefined>).NODE_ENV = previousEnv
})

describe('getPrisma', () => {
  it.each(['production', 'development'])('returns one client under NODE_ENV=%s', (env) => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = env

    const first = getPrisma()
    const second = getPrisma()
    const third = getPrisma()

    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it('leaves the client on globalThis so a second import reuses it', () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'

    const client = getPrisma()
    expect(globalForPrisma.huntPrisma).toBe(client)
  })
})
