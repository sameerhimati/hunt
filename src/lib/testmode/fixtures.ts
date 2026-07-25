import fs from 'node:fs'
import path from 'node:path'

/**
 * Fixture reading for test mode. Every `fs` call in the app-side test-mode path
 * lives here, and this module is only ever imported lazily from behind an
 * `isTestMode()` check (see ./env.ts).
 *
 * Two constraints shape the shape of this file:
 *  - the literal `'gates', 'fixtures'` segments are repeated at each call rather
 *    than factored into a helper, because Turbopack's tracer reads the call site
 *    and treats a computed path as "this app reads arbitrary files" — which
 *    makes it trace the whole project into the standalone output;
 *  - for the same reason the app-side loader has no `HUNT_FIXTURES_DIR`
 *    override. Gate tests that want a different fixture root resolve it
 *    themselves (they read fixtures directly), and the running app only ever
 *    needs the committed set.
 */

export function fixturesDir(): string {
  return path.join(process.cwd(), 'gates', 'fixtures')
}

export function fixturePath(...segments: string[]): string {
  return path.join(fixturesDir(), ...segments)
}

export function fixtureExists(...segments: string[]): boolean {
  return fs.existsSync(path.join(process.cwd(), 'gates', 'fixtures', ...segments))
}

export function readTextFixture(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), 'gates', 'fixtures', ...segments), 'utf8')
}

export function readJsonFixture<T = unknown>(...segments: string[]): T {
  return JSON.parse(readTextFixture(...segments)) as T
}

/** Fixture file names in a subdirectory, sorted; empty when the dir is absent. */
export function listFixtures(dir: string, extension: string): string[] {
  if (!fixtureExists(dir)) return []

  return fs
    .readdirSync(path.join(process.cwd(), 'gates', 'fixtures', dir))
    .filter((name) => name.endsWith(extension))
    .sort()
}
