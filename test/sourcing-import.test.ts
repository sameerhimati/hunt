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

  it('keeps two link-less listings apart instead of colliding on one empty URL', async () => {
    // Every board mapper emits `url: '' ` when the provider gave no link, and
    // '' is a value on a unique index, not a missing one.
    const first = await pullIntoPipeline(listing('urlless-1', { url: '' }))
    const second = await pullIntoPipeline(
      listing('urlless-2', { url: '', title: 'Staff Data Engineer' }),
    )

    expect(second.job.id).not.toBe(first.job.id)
    expect(second.application.id).not.toBe(first.application.id)

    const kept = await prisma.job.findUnique({ where: { id: first.job.id } })
    expect(kept?.title).toBe('Senior Backend Engineer')
  })

  it('re-pulls a link-less listing onto its own row rather than dealing a duplicate', async () => {
    const input = listing('urlless-idempotent', { url: '' })

    const first = await pullIntoPipeline(input)
    const second = await pullIntoPipeline(input)

    expect(second.job.id).toBe(first.job.id)
    expect(second.application.id).toBe(first.application.id)
  })

  it('treats a tracking param as the same posting, not a second card', async () => {
    const canonical = listing('utm-1')
    const tracked = listing('utm-1', {
      externalId: 'utm-1-again',
      url: `https://WWW.jobs.example.com/utm-1/?utm_source=remotive&ref=weekly`,
    })

    const first = await pullIntoPipeline(canonical)
    const second = await pullIntoPipeline(tracked)

    expect(second.job.id).toBe(first.job.id)
    expect(second.application.id).toBe(first.application.id)
    expect(await prisma.application.count({ where: { jobId: first.job.id } })).toBe(1)
  })

  it('never overwrites a correction the user made or a JD already scraped', async () => {
    const { job } = await pullIntoPipeline(listing('refresh-1'))

    const scraped = 'The full posting, as Firecrawl returned it. '.repeat(40).trim()
    await prisma.job.update({
      where: { id: job.id },
      data: {
        title: 'Staff Backend Engineer',
        company: 'Northwind Robotics, Inc.',
        jdText: scraped,
        source: 'paste',
      },
    })

    const { job: after } = await pullIntoPipeline(
      listing('refresh-1', { description: undefined }),
    )

    expect(after.title).toBe('Staff Backend Engineer')
    expect(after.company).toBe('Northwind Robotics, Inc.')
    expect(after.jdText).toBe(scraped)
    // How the row arrived is history, not a field a later sighting rewrites.
    expect(after.source).toBe('paste')
  })

  it('lets a fuller description win but never a placeholder', async () => {
    await pullIntoPipeline(listing('jd-1', { description: 'Short blurb.' }))

    const full = 'You will own the fleet ingestion pipeline. '.repeat(20).trim()
    const { job: better } = await pullIntoPipeline(listing('jd-1', { description: full }))
    expect(better.jdText).toBe(full)

    const { job: unchanged } = await pullIntoPipeline(
      listing('jd-1', { description: undefined }),
    )
    expect(unchanged.jdText).toBe(full)
  })

  it('replaces the no-description placeholder as soon as a real body arrives', async () => {
    const { job } = await pullIntoPipeline(listing('jd-2', { description: undefined }))
    expect(job.jdText).toContain('No description was returned')

    const { job: filled } = await pullIntoPipeline(
      listing('jd-2', { description: 'The real posting body.' }),
    )
    expect(filled.jdText).toBe('The real posting body.')
  })
})
