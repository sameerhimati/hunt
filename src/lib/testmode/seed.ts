import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'

import { readJsonFixture } from './fixtures'

/**
 * The résumé a newly created résumé starts from in `HUNT_TEST_MODE`.
 *
 * Gates arrange through the product, not the database: the Phase 3 e2e clicks
 * `new-resume` → `create-resume` and then tailors what it got. With the
 * production `emptyResume(name)` there would be nothing to tailor — every
 * scripted citation would fail to resolve, all three changes would be refused,
 * and there would be no `accept-change` row on the screen. Seeding a real
 * document from `gates/fixtures/resume/seed-base.json` is what makes the whole
 * flow exercisable end to end.
 *
 * Like every fixture reader, this module touches the filesystem and is imported
 * only from behind an `isTestMode()` check, lazily (see ./env.ts).
 */
export function seededResumeContent(name: string): ResumeContent {
  const content = parseResumeContent(readJsonFixture('resume', 'seed-base.json'))

  // The user typed a name; the seed exists to give them a document, not to
  // rename them. Everything else is the fixture verbatim — seed-base.json
  // documents the one field that deliberately differs from alex-chen.json.
  return { ...content, basics: { ...content.basics, name } }
}
