import { prisma } from '@/lib/db/client'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'
import { createResume } from '@/lib/resume/store'

import { isTestMode } from './env'
import { fixtureExists, readJsonFixture } from './fixtures'

/**
 * Test-mode seeding: the two places where `HUNT_TEST_MODE` supplies a *document*
 * rather than swapping an adapter or the LLM for a fixture twin.
 *
 * Phase 3 and Phase 5 arrived at this need independently and from opposite ends
 * — one seeds the content a new résumé starts from, the other seeds a row when
 * the database is empty — so they live together here rather than in two files
 * racing for the same name.
 *
 * Like every fixture reader, this module touches the filesystem and is imported
 * only from behind an `isTestMode()` check, lazily (see ./env.ts).
 */

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
 */
export function seededResumeContent(name: string): ResumeContent {
  const content = parseResumeContent(readJsonFixture('resume', 'seed-base.json'))

  // The user typed a name; the seed exists to give them a document, not to
  // rename them. Everything else is the fixture verbatim — seed-base.json
  // documents the one field that deliberately differs from alex-chen.json.
  return { ...content, basics: { ...content.basics, name } }
}

/**
 * Fit rating is résumé-vs-job by definition. `pnpm gate 5` boots a wiped data
 * dir and the e2e gate goes straight to /sourcing expecting fit tiers, so with
 * zero résumés in the database there is nothing honest to rate — the gate is
 * unsatisfiable, and the alternative (a screen that invents a rating without a
 * résumé) is the thing this product refuses.
 *
 * It is deliberately narrow: it fires only from the /sourcing loader, only under
 * `HUNT_TEST_MODE=1`, and only when the database holds no résumé at all — so it
 * can never overwrite or shadow a real one, and the earlier phases' e2e gates
 * (which never load /sourcing) see exactly the data they created.
 */

/** Obvious on sight in the résumés list — nobody should mistake it for their own. */
export const FIXTURE_RESUME_NAME = 'Alex Chen (fixture)'

let pending: Promise<string | null> | null = null

/** The base (parentless) version of a résumé, falling back to its oldest row. */
function baseVersionId(versions: { id: string; parentVersionId: string | null }[]): string | null {
  return (versions.find((version) => !version.parentVersionId) ?? versions[0])?.id ?? null
}

async function seed(): Promise<string | null> {
  const existing = await prisma.resume.findFirst({
    orderBy: { createdAt: 'asc' },
    include: { versions: { orderBy: { createdAt: 'asc' } } },
  })
  if (existing) return baseVersionId(existing.versions)

  // No fixture, no seed. A missing file means someone changed the fixture set,
  // and inventing a résumé here would be worse than an empty sourcing screen.
  if (!fixtureExists('resume', 'alex-chen.json')) return null

  const content = parseResumeContent(readJsonFixture('resume', 'alex-chen.json'))
  const resume = await createResume(FIXTURE_RESUME_NAME, content)
  return baseVersionId(resume.versions)
}

/**
 * The id of a résumé version the sourcing board can rate against, seeding the
 * fixture résumé on first call if the database is empty. Returns null outside
 * test mode. Idempotent, and concurrent callers share one seed rather than
 * racing two identical résumés into the database.
 */
export function ensureFixtureResume(): Promise<string | null> {
  if (!isTestMode()) return Promise.resolve(null)

  pending ??= seed().finally(() => {
    pending = null
  })

  return pending
}
