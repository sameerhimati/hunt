/**
 * Barrel for tests and gates. Application code imports `isTestMode` from
 * `./env` and pulls the rest in with a dynamic import behind that check — this
 * module reaches the filesystem and must stay out of the static server graph.
 */
export { isTestMode, TEST_MODEL } from './env'
export {
  fixtureExists,
  fixturePath,
  fixturesDir,
  listFixtures,
  readJsonFixture,
  readTextFixture,
} from './fixtures'
export { testAdapter } from './adapters'
export { scriptedLlm, testLlm } from './llm'
