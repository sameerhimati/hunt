import { describe, expect, it } from 'vitest'

import type { JobListing } from '@/lib/adapters/jobs/types'
import { prisma } from '@/lib/db/client'
import type { FitRating } from '@/lib/fit/rate'
import { pullIntoPipeline } from '@/lib/sourcing/import'

/**
 * A fresh URL per test. `Job.url` is unique and rows outlive the test that
 * created them, so a shared URL would silently couple the create path to the
 * re-pull path depending on run order.
 */
function listing(slug: string, overrides: Partial<JobListing> = {}): JobListing {
  return {
    externalId: slug,
    title: 'Senior Backend Engineer',
    company: 'Northwind Robotics',
    location: 'Remote — US',
    url: `https://jobs.example.com/${slug}`,
    description: 'You will own the fleet ingestion pipeline.',
    source: 'fake-jobs',
    ...overrides,
  }
}

describe('pullIntoPipeline', () => {
  it('creates an api-sourced job and a sourced application', async () => {
    const input = listing('create-1')
    const { job, application } = await pullIntoPipeline(input)

    expect(job.source).toBe('api')
    expect(job.title).toBe(input.title)
    expect(job.company).toBe(input.company)
    expect(job.location).toBe(input.location)
    expect(job.jdText).toBe(input.description)
    expect(job.scrapedAt).toBeInstanceOf(Date)

    expect(application.jobId).toBe(job.id)
    expect(application.status).toBe('sourced')
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toBeTruthy()
  })

  it('is idempotent — re-pulling the same posting deals no duplicate card', async () => {
    const input = listing('idempotent-1')

    const first = await pullIntoPipeline(input)
    const second = await pullIntoPipeline(input)

    expect(second.job.id).toBe(first.job.id)
    expect(second.application.id).toBe(first.application.id)
    expect(await prisma.job.count({ where: { url: input.url } })).toBe(1)
    expect(await prisma.application.count({ where: { jobId: first.job.id } })).toBe(1)
  })

  it('persists the tier the user saw on the sourcing board', async () => {
    const rating: FitRating = {
      tier: 'strong',
      reasons: [
        { text: 'Go + distributed systems', citations: ['skills[0].items[0]'], gap: false },
        { text: 'No Kubernetes evidence', citations: [], gap: true },
      ],
    }

    const { application } = await pullIntoPipeline(listing('rated-1'), rating)

    expect(application.fitTier).toBe('strong')
    expect(JSON.parse(application.fitReasons ?? 'null')).toEqual(rating.reasons)
  })

  it('leaves fit null when nothing rated the listing', async () => {
    const { application } = await pullIntoPipeline(listing('unrated-1'))

    expect(application.fitTier).toBeNull()
    expect(application.fitReasons).toBeNull()
  })

  it('still produces a usable row when the board returned no description', async () => {
    const input = listing('no-body-1', { description: undefined })
    const { job } = await pullIntoPipeline(input)

    expect(job.jdText).toContain(input.source)
    expect(job.jdText).toContain(input.url)
    // Never a fabricated JD: the placeholder names its own absence.
    expect(job.jdText.length).toBeGreaterThan(0)
  })
})
