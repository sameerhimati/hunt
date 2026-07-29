/**
 * `HUNT_TEST_MODE=1` swaps every outside-world dependency for its fixture-backed
 * twin: adapters become the `Fake*` classes, the LLM becomes a scripted
 * FakeLlmProvider. Gates and e2e run with no keys, no network and no flake,
 * through the exact call sites production uses.
 *
 * It is opt-in by env var only — nothing in the app can turn it on at runtime.
 *
 * This file deliberately imports nothing: production code checks the flag, and
 * only the fixture-reading modules (which touch `fs`) are pulled in behind it,
 * lazily, so the build tracer never walks them.
 */
export function isTestMode(): boolean {
  return process.env.HUNT_TEST_MODE === '1'
}

/** The model id the scripted provider reports — recorded on rows, so keep it obvious. */
export const TEST_MODEL = 'fake-1'

/**
 * The address the fake email adapter sends as. A configured email provider is
 * two things — something that can send and someone it sends as — so the twin
 * has to stand in for both, or the send path stops one step short of the
 * behaviour it is meant to exercise. Obvious on sight, like `TEST_MODEL`.
 */
export const TEST_FROM_ADDRESS = 'you@hunt.local'
