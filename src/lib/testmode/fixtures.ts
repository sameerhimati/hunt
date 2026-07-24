import fs from 'node:fs'
import path from 'node:path'

/**
 * `HUNT_TEST_MODE=1` swaps every outside-world dependency for its fixture-backed
 * twin: adapters become the `Fake*` classes, the LLM becomes a scripted
 * FakeLlmProvider. Gates and e2e run with no keys, no network and no flake,
 * through the exact call sites production uses.
 *
 * It is opt-in by env var only — nothing in the app can turn it on at runtime.
 */
export function isTestMode(): boolean {
  return process.env.HUNT_TEST_MODE === '1'
}

/**
 * Where the fixtures live. `HUNT_FIXTURES_DIR` overrides it (absolute or
 * relative), matching what the gate tests themselves resolve.
 */
export function fixturesDir(): string {
  return path.resolve(process.cwd(), process.env.HUNT_FIXTURES_DIR ?? 'gates/fixtures')
}

export function fixturePath(...segments: string[]): string {
  return path.join(fixturesDir(), ...segments)
}

export function readJsonFixture<T = unknown>(...segments: string[]): T {
  return JSON.parse(fs.readFileSync(fixturePath(...segments), 'utf8')) as T
}

/** Fixture file names in a subdirectory, sorted; empty when the dir is absent. */
export function listFixtures(dir: string, extension: string): string[] {
  const full = fixturePath(dir)
  if (!fs.existsSync(full)) return []
  return fs
    .readdirSync(full)
    .filter((name) => name.endsWith(extension))
    .sort()
}
