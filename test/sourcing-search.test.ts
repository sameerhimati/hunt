import { describe, expect, it, vi } from 'vitest'

import { FakeJobsAdapter } from '@/lib/adapters/jobs/fake'
import { jsearchMeta } from '@/lib/adapters/jobs/jsearch'
import type { JobListing, JobQuery, JobsAdapter } from '@/lib/adapters/jobs/types'
import { AdapterError, type ConnectionTestResult } from '@/lib/adapters/types'
import { searchJobs, searchJobsDetailed } from '@/lib/sourcing/search'

const listing = (overrides: Partial<JobListing>): JobListing => ({
  externalId: 'x',
  title: 'Senior Backend Engineer',
  company: 'Northwind Robotics',
  url: 'https://jobs.example.com/x',
  source: 'fake-jobs',
  ...overrides,
})

/** An adapter that always fails — the 429 that must not blank the page. */
class BrokenJobsAdapter implements JobsAdapter {
  readonly id = 'broken-jobs'
  readonly meta = jsearchMeta

  async search(): Promise<JobListing[]> {
    throw new AdapterError('JSearch', 'rate limited (429). Try again in a minute.', {
      status: 429,
      retryable: true,
    })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, detail: '429 · rate limited', status: 429 }
  }
}

describe('searchJobs', () => {
  it('merges adapters and dedupes by externalId, first adapter winning', async () => {
    const a = new FakeJobsAdapter([
      listing({ externalId: 'dup-1', title: 'Senior Backend Engineer' }),
      listing({ externalId: 'a-2', title: 'Backend Engineer, Fleet' }),
    ])
    const b = new FakeJobsAdapter([
      listing({ externalId: 'dup-1', title: 'Senior Backend Engineer', source: 'other' }),
      listing({ externalId: 'b-9', title: 'Backend Platform Engineer' }),
    ])

    const results = await searchJobs({ keywords: 'backend' }, { adapters: [a, b] })

    // Adapter order is preserved, so the page doesn't reshuffle between runs.
    expect(results.map((r) => r.externalId)).toEqual(['dup-1', 'a-2', 'b-9'])
    expect(results[0].source).toBe('fake-jobs')
  })

  it('dedupes the same posting behind different ids by normalised url', async () => {
    const jsearch = new FakeJobsAdapter([
      listing({ externalId: 'js-1', url: 'https://jobs.example.com/acme/backend-engineer' }),
    ])
    const boards = new FakeJobsAdapter([
      listing({
        externalId: 'remotive-88',
        // Same posting: www, trailing slash, tracking param.
        url: 'https://WWW.jobs.example.com/acme/backend-engineer/?utm_source=remotive',
        description: 'Backend engineer, full JD.',
      }),
    ])

    const results = await searchJobs({ keywords: 'backend' }, { adapters: [jsearch, boards] })

    expect(results).toHaveLength(1)
    expect(results[0].externalId).toBe('js-1')
    // The duplicate's description survives — fit rating reads it.
    expect(results[0].description).toBe('Backend engineer, full JD.')
  })

  it('keeps different roles apart even when a board reuses one landing url', async () => {
    const shared = 'https://jobs.example.com/northwind'
    const a = new FakeJobsAdapter([
      listing({ externalId: 'a-1', title: 'Backend Engineer, Fleet', url: shared }),
    ])
    const b = new FakeJobsAdapter([
      listing({ externalId: 'b-1', title: 'Backend Platform Engineer', url: shared }),
    ])

    const results = await searchJobs({ keywords: 'backend' }, { adapters: [a, b] })
    expect(results.map((r) => r.externalId)).toEqual(['a-1', 'b-1'])
  })

  it('keeps genuinely different postings apart when params select the posting', async () => {
    const a = new FakeJobsAdapter([
      listing({ externalId: 'a-1', url: 'https://boards.example.com/jobs?id=1' }),
    ])
    const b = new FakeJobsAdapter([
      listing({ externalId: 'b-1', url: 'https://boards.example.com/jobs?id=2' }),
    ])

    const results = await searchJobs({ keywords: 'backend' }, { adapters: [a, b] })
    expect(results.map((r) => r.externalId)).toEqual(['a-1', 'b-1'])
  })

  it('still returns the healthy adapter when another throws AdapterError', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const healthy = new FakeJobsAdapter([listing({ externalId: 'ok-1' })])

    const { listings, failures } = await searchJobsDetailed(
      { keywords: 'backend' },
      { adapters: [new BrokenJobsAdapter(), healthy] },
    )

    expect(listings.map((r) => r.externalId)).toEqual(['ok-1'])
    expect(failures).toHaveLength(1)
    expect(failures[0].provider).toBe('broken-jobs')
    // Shown verbatim in the UI, so it must name the provider and the reason.
    expect(failures[0].message).toBe('JSearch: rate limited (429). Try again in a minute.')
    warn.mockRestore()
  })

  it('throws the provider error when every adapter fails', async () => {
    await expect(
      searchJobs({ keywords: 'backend' }, { adapters: [new BrokenJobsAdapter()] }),
    ).rejects.toThrow(/rate limited \(429\)/)
  })

  it('returns nothing rather than throwing when there are no adapters at all', async () => {
    await expect(searchJobs({ keywords: 'backend' }, { adapters: [] })).resolves.toEqual([])
  })

  it('passes location and remoteOnly through to every adapter', async () => {
    const a = new FakeJobsAdapter()
    const b = new FakeJobsAdapter()
    const query: JobQuery = { keywords: 'backend', location: 'Austin, TX', remoteOnly: true }

    const results = await searchJobs(query, { adapters: [a, b] })

    expect(a.queries).toEqual([query])
    expect(b.queries).toEqual([query])
    // The fake honours remoteOnly, so an on-site fixture must not come back.
    expect(results.every((r) => r.remote)).toBe(true)
    expect(results.map((r) => r.externalId)).toEqual(['fake-3'])
  })
})
