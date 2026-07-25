import { FakeEmailAdapter } from '@/lib/adapters/email/fake'
import { FakeJobsAdapter } from '@/lib/adapters/jobs/fake'
import { FakePeopleAdapter } from '@/lib/adapters/people/fake'
import { FakeScrapeAdapter } from '@/lib/adapters/scrape/fake'
import type { ScrapedPage } from '@/lib/adapters/scrape/types'
import type { Adapter } from '@/lib/adapters/types'
import type { ProviderMeta } from '@/lib/providers/types'

import { fixtureExists, listFixtures, readJsonFixture, readTextFixture } from './fixtures'

interface JobFixture {
  url?: string
  expected?: { title?: string; company?: string }
}

/**
 * Every `gates/fixtures/jobs/<name>.json` that names a URL is served from its
 * sibling `<name>.md`, so pasting that URL in test mode returns the recorded JD
 * exactly as Firecrawl would. An unregistered URL still fails like the real
 * adapter — a fake that invents pages would hide bugs.
 */
function scrapeFixtures(): Record<string, Omit<ScrapedPage, 'fetchedAt'>> {
  const pages: Record<string, Omit<ScrapedPage, 'fetchedAt'>> = {}

  for (const file of listFixtures('jobs', '.json')) {
    const fixture = readJsonFixture<JobFixture>('jobs', file)
    if (!fixture?.url) continue

    const markdown = file.replace(/\.json$/, '.md')
    if (!fixtureExists('jobs', markdown)) continue

    const { title, company } = fixture.expected ?? {}
    pages[fixture.url] = {
      url: fixture.url,
      title: title && company ? `${title} — ${company}` : title,
      markdown: readTextFixture('jobs', markdown),
    }
  }

  return pages
}

/**
 * The fixture-backed twin for a provider, chosen by category so a new provider
 * in an existing category is covered the day it is registered.
 *
 * LinkedIn is deliberately absent: it stays off unless explicitly opted in
 * (Phase 6 owns that switch), and test mode must not be the thing that turns it
 * on.
 */
export function testAdapter(meta: ProviderMeta): Adapter | null {
  switch (meta.category) {
    case 'scrape':
      return new FakeScrapeAdapter(scrapeFixtures())
    case 'jobs':
      return new FakeJobsAdapter()
    case 'people':
      return new FakePeopleAdapter()
    case 'email':
      return new FakeEmailAdapter()
    default:
      return null
  }
}
