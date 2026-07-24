import fs from 'node:fs'
import path from 'node:path'

/**
 * Everything hunt persists lives in one directory so a user can back it up,
 * inspect it, or delete it in a single move — and so Docker can mount it as
 * one volume. Override with `HUNT_DATA_DIR` (tests and e2e do exactly that).
 */
export function dataDir(): string {
  // The turbopackIgnore hint is load-bearing: resolving against process.cwd()
  // makes the build tracer assume the whole project is a runtime dependency and
  // bundle it into the standalone output. This path is resolved at runtime and
  // nothing under it needs tracing.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.HUNT_DATA_DIR ?? './data')
}

export function dbPath(): string {
  return path.join(dataDir(), 'hunt.db')
}

export function dbUrl(): string {
  return process.env.DATABASE_URL ?? `file:${dbPath()}`
}

/** The generated AES key that seals API keys at rest. Never leaves the machine. */
export function secretKeyPath(): string {
  return path.join(dataDir(), 'secret.key')
}

/** Creates the data directory on demand — a fresh clone has no `./data`. */
export function ensureDataDir(): string {
  const dir = dataDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
