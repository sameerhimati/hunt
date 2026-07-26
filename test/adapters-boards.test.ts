import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FreeBoardsAdapter, parseBoardTargets } from '@/lib/adapters/jobs/boards'
import type { JobListing } from '@/lib/adapters/jobs/types'
import { AdapterError } from '@/lib/adapters/types'

const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures/jobs')
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'))

const REMOTIVE_BODY = {
  jobs: [
    {
      id: 1908431,
      title: 'Senior Backend Engineer',
      company_name: 'Aurora Labs',
      candidate_required_location: 'Worldwide',
      url: 'https://remotive.com/remote-jobs/software-dev/senior-backend-engineer-1908431',
      description: 'Python and Postgres at scale.',
      publication_date: '2026-07-09T08:12:00',
    },
    {
      id: 1908999,
      title: 'Customer Success Manager',
      company_name: 'Aurora Labs',
      candidate_required_location: 'USA Only',
      url: 'https://remotive.com/remote-jobs/customer-support/csm-1908999',
      description: 'Own renewals for our enterprise book.',
      publication_date: '2026-07-03T08:12:00',
    },
  ],
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

/**
 * Serves each recorded fixture only for the board token it was recorded from,
 * so a wrong-vendor guess 404s exactly as the real endpoint does. Overrides are
 * keyed by hostname, which is how a test knocks out one board.
 */
function router(overrides: Record<string, () => Promise<Response>> = {}): typeof fetch {
  const routes: Record<string, (url: URL) => Promise<Response>> = {
    'remotive.com': async () => ok(REMOTIVE_BODY),
    'boards-api.greenhouse.io': async (url) =>
      url.pathname.includes('/boards/northwind/')
        ? ok(fixture('boards-greenhouse.json'))
        : new Response('not found', { status: 404 }),
    'api.lever.co': async (url) =>
      url.pathname.endsWith('/halcyon')
        ? ok(fixture('boards-lever.json'))
        : new Response('not found', { status: 404 }),
    'api.ashbyhq.com': async (url) =>
      url.pathname.endsWith('/meridian')
        ? ok(fixture('boards-ashby.json'))
        : new Response('not found', { status: 404 }),
    ...overrides,
  }

  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const route = routes[url.hostname]
    if (!route) return new Response('not found', { status: 404 })
    return route(url)
  }) as typeof fetch
}

const bySource = (listings: JobListing[], source: string) =>
  listings.filter((job) => job.source === source)

describe('parseBoardTargets', () => {
  it('fans a bare token out to all three boards and honours a pinned one', () => {
    expect(parseBoardTargets('northwind, lever:halcyon ,')).toEqual([
      { board: 'greenhouse', token: 'northwind' },
      { board: 'lever', token: 'northwind' },
      { board: 'ashby', token: 'northwind' },
      { board: 'lever', token: 'halcyon' },
    ])
  })

  it('is empty for an unset setting', () => {
    expect(parseBoardTargets(null)).toEqual([])
    expect(parseBoardTargets('  ')).toEqual([])
  })
})

describe('FreeBoardsAdapter normalisation', () => {
  it('normalises Greenhouse postings', async () => {
    const adapter = new FreeBoardsAdapter(router(), 'greenhouse:northwind')
    const jobs = bySource(await adapter.search({ keywords: '' }), 'greenhouse')

    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      externalId: 'greenhouse-northwind-4012345',
      title: 'Senior Backend Engineer',
      company: 'Northwind',
      location: 'Austin, TX',
      url: 'https://job-boards.greenhouse.io/northwind/jobs/4012345',
      remote: false,
      source: 'greenhouse',
    })
    expect(jobs[0].postedAt?.toISOString()).toBe('2026-07-02T18:21:09.000Z')
    // "Remote - US" in the office name is the only remote signal Greenhouse gives.
    expect(jobs[1].remote).toBe(true)
  })

  it('normalises Lever postings', async () => {
    const adapter = new FreeBoardsAdapter(router(), 'lever:halcyon')
    const jobs = bySource(await adapter.search({ keywords: '' }), 'lever')

    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      externalId: 'lever-halcyon-7c1f0a4e-1b2c-4d3e-9f10-abcdef123456',
      title: 'Backend Engineer, Payments',
      company: 'Halcyon',
      location: 'Remote — US',
      url: 'https://jobs.lever.co/halcyon/7c1f0a4e-1b2c-4d3e-9f10-abcdef123456',
      remote: true,
      source: 'lever',
    })
    expect(jobs[0].description).toContain('ledger correctness')
    expect(jobs[1].remote).toBe(false)
  })

  it('normalises Ashby postings', async () => {
    const adapter = new FreeBoardsAdapter(router(), 'ashby:meridian')
    const jobs = bySource(await adapter.search({ keywords: '' }), 'ashby')

    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      externalId: 'ashby-meridian-0a9b8c7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d',
      title: 'Platform Engineer',
      company: 'Meridian Health',
      url: 'https://jobs.ashbyhq.com/meridian/0a9b8c7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d',
      remote: true,
      source: 'ashby',
    })
    expect(jobs[1].remote).toBe(false)
  })

  it('keeps Remotive on even with no company tokens configured', async () => {
    const adapter = new FreeBoardsAdapter(router(), '')
    const jobs = await adapter.search({ keywords: '' })

    expect(jobs.every((job) => job.source === 'remotive')).toBe(true)
    expect(jobs[0].externalId).toBe('remotive-1908431')
    expect(adapter.errors).toHaveLength(0)
  })
})

describe('FreeBoardsAdapter degradation', () => {
  it('keeps the other boards when one token 404s', async () => {
    const adapter = new FreeBoardsAdapter(
      router({ 'boards-api.greenhouse.io': async () => new Response('no board', { status: 404 }) }),
      'greenhouse:ghost, lever:halcyon, ashby:meridian',
    )

    const jobs = await adapter.search({ keywords: '' })
    expect(bySource(jobs, 'greenhouse')).toHaveLength(0)
    expect(bySource(jobs, 'lever')).toHaveLength(2)
    expect(bySource(jobs, 'ashby')).toHaveLength(2)
    expect(bySource(jobs, 'remotive').length).toBeGreaterThan(0)

    expect(adapter.errors).toHaveLength(1)
    expect(adapter.errors[0]).toBeInstanceOf(AdapterError)
    expect(adapter.errors[0].message).toContain('Greenhouse')
    expect(adapter.errors[0].message).toContain('ghost')
    expect(adapter.errors[0].status).toBe(404)
  })

  it('survives a board that throws rather than answers', async () => {
    const adapter = new FreeBoardsAdapter(
      router({
        'api.lever.co': async () => {
          throw new Error('ECONNRESET')
        },
      }),
      'lever:halcyon',
    )

    const jobs = await adapter.search({ keywords: '' })
    expect(bySource(jobs, 'remotive').length).toBeGreaterThan(0)
    expect(adapter.errors[0].message).toContain('unreachable')
  })

  it('throws when every source is down, rather than pretending nothing matched', async () => {
    const adapter = new FreeBoardsAdapter(
      () => Promise.resolve(new Response('down', { status: 503 })),
      'lever:halcyon',
    )

    await expect(adapter.search({ keywords: 'backend' })).rejects.toBeInstanceOf(AdapterError)
  })
})

describe('FreeBoardsAdapter client-side filters', () => {
  it('filters every board on the keyword', async () => {
    const adapter = new FreeBoardsAdapter(router(), 'northwind, lever:halcyon, ashby:meridian')
    const jobs = await adapter.search({ keywords: 'backend' })

    expect(jobs.map((job) => job.title).sort()).toEqual([
      'Backend Engineer, Payments',
      'Senior Backend Engineer',
      'Senior Backend Engineer',
    ])
    // `northwind` was fanned out to Lever and Ashby too, and both 404 — a bare
    // token must not turn into a hard failure.
    expect(jobs.length).toBeGreaterThan(0)
  })

  it('filters on location and remoteOnly', async () => {
    const adapter = new FreeBoardsAdapter(router(), 'greenhouse:northwind')

    const austin = await adapter.search({ keywords: '', location: 'austin' })
    expect(austin.map((job) => job.externalId)).toEqual(['greenhouse-northwind-4012345'])

    const remote = await adapter.search({ keywords: '', remoteOnly: true })
    expect(remote.every((job) => job.remote)).toBe(true)
    expect(remote.some((job) => job.source === 'greenhouse')).toBe(true)
  })
})
