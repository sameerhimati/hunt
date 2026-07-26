import { prisma } from '@/lib/db/client'
import { parseResumeContent } from '@/lib/resume/schema'
import { createResume } from '@/lib/resume/store'

import { isTestMode } from './env'
import { fixtureExists, readJsonFixture } from './fixtures'

/**
 * The one test-mode branch that seeds *app data* rather than swapping an adapter
 * or the LLM for a fixture twin.
 *
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
 *
 * Called through a dynamic import from behind `isTestMode()`, like every other
 * module in this directory: it reads the filesystem and must stay out of the
 * static server graph.
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
