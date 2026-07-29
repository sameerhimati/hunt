import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseBoardPostingUrl } from '@/lib/adapters/jobs/board-urls'
import { FreeBoardsAdapter } from '@/lib/adapters/jobs/boards'
import { fetchBoardPosting } from '@/lib/adapters/jobs/posting'
import { AdapterError } from '@/lib/adapters/types'
import { prisma } from '@/lib/db/client'
import { ingestBoardPosting } from '@/lib/jobs/ingest'

/**
 * Pasting an Ashby/Greenhouse/Lever link with **no key configured at all**.
 *
 * Two thirds of the postings a real user pastes live on those three boards, and
 * all three hand back canonical JSON for free. The tests here run entirely on
 * the recorded board fixtures — the same ones the search path uses, because the
 * single-job path is required to produce byte-identical listings.
 */

const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures/jobs')
const fixture = <T>(name: string): T =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T

const GREENHOUSE = fixture<{ jobs: { id: number }[] }>('boards-greenhouse.json')
const LEVER = fixture<{ id: string }[]>('boards-lever.json')
const ASHBY = fixture<{ jobs: { id: string }[] }>('boards-ashby.json')

const GH_ID = String(GREENHOUSE.jobs[0].id)
const LEVER_ID = LEVER[0].id
const ASHBY_ID = ASHBY.jobs[0].id

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const missing = () => new Response('not found', { status: 404 })

/**
 * The three real endpoints, served from fixtures and keyed by hostname exactly
 * as `test/adapters-boards.test.ts` does. Greenhouse and Lever answer per job;
 * Ashby has no per-job route at all and only ever answers with the whole board.
 */
function router(overrides: Record<string, () => Promise<Response>> = {}) {
  const calls: string[] = []

  const routes: Record<string, (url: URL) => Promise<Response>> = {
    'boards-api.greenhouse.io': async (url) => {
      const job = GREENHOUSE.jobs.find((entry) =>
        url.pathname.endsWith(`/boards/northwind/jobs/${entry.id}`),
      )
      return job ? ok(job) : missing()
    },
    'api.lever.co': async (url) => {
      const job = LEVER.find((entry) => url.pathname.endsWith(`/postings/halcyon/${entry.id}`))
      return job ? ok(job) : missing()
    },
    'api.ashbyhq.com': async (url) =>
      url.pathname.endsWith('/job-board/meridian') ? ok(ASHBY) : missing(),
    ...overrides,
  }

  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url.toString())
    const route = routes[url.hostname]
    return route ? route(url) : missing()
  }) as typeof fetch

  return Object.assign(impl, { calls })
}

/** The listing the *search* path produces for the same posting. */
async function fromSearch(companies: string, source: string, externalId: string) {
  const listings = await new FreeBoardsAdapter(
    listRouter(),
    companies,
  ).search({ keywords: '' })
  return listings.find((job) => job.source === source && job.externalId === externalId)
}

/** The list endpoints, whose envelopes differ from the single-job ones. */
function listRouter(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    if (url.hostname === 'boards-api.greenhouse.io' && url.pathname.includes('/northwind/')) {
      return ok(GREENHOUSE)
    }
    if (url.hostname === 'api.lever.co' && url.pathname.endsWith('/halcyon')) return ok(LEVER)
    if (url.hostname === 'api.ashbyhq.com' && url.pathname.endsWith('/meridian')) return ok(ASHBY)
    return missing()
  }) as typeof fetch
}

describe('parseBoardPostingUrl', () => {
  it('reads Greenhouse postings on both the current and the legacy host', () => {
    expect(parseBoardPostingUrl('https://job-boards.greenhouse.io/northwind/jobs/4012345')).toEqual({
      board: 'greenhouse',
      org: 'northwind',
      jobId: '4012345',
    })
    expect(parseBoardPostingUrl('https://boards.greenhouse.io/northwind/jobs/4012345')).toEqual({
      board: 'greenhouse',
      org: 'northwind',
      jobId: '4012345',
    })
  })

  it('reads the gh_jid query form embedded boards hand out', () => {
    expect(parseBoardPostingUrl('https://job-boards.greenhouse.io/northwind?gh_jid=4012345')).toEqual(
      { board: 'greenhouse', org: 'northwind', jobId: '4012345' },
    )
    expect(
      parseBoardPostingUrl('https://boards.greenhouse.io/embed/job_app?for=northwind&token=4012345'),
    ).toEqual({ board: 'greenhouse', org: 'northwind', jobId: '4012345' })
  })

  it('declines a gh_jid link whose board token is nowhere in the URL', () => {
    // The company's own careers page: the job id is there, the board is not, so
    // there is nothing to call. Firecrawl still handles it.
    expect(parseBoardPostingUrl('https://www.northwind.com/careers?gh_jid=4012345')).toBeNull()
  })

  it('reads Lever and Ashby postings, apply/application suffix and all', () => {
    const lever = { board: 'lever', org: 'halcyon', jobId: LEVER_ID }
    expect(parseBoardPostingUrl(`https://jobs.lever.co/halcyon/${LEVER_ID}`)).toEqual(lever)
    expect(parseBoardPostingUrl(`https://jobs.lever.co/halcyon/${LEVER_ID}/apply`)).toEqual(lever)

    const ashby = { board: 'ashby', org: 'meridian', jobId: ASHBY_ID }
    expect(parseBoardPostingUrl(`https://jobs.ashbyhq.com/meridian/${ASHBY_ID}`)).toEqual(ashby)
    expect(
      parseBoardPostingUrl(`https://jobs.ashbyhq.com/meridian/${ASHBY_ID}/application`),
    ).toEqual(ashby)
  })

  it('shrugs off casing, www and trailing slashes', () => {
    expect(parseBoardPostingUrl('HTTPS://WWW.Jobs.Lever.co/Halcyon/ABC-123/')).toEqual({
      board: 'lever',
      org: 'Halcyon',
      jobId: 'ABC-123',
    })
  })

  it('matches nothing it cannot serve', () => {
    // A board root is not a posting.
    expect(parseBoardPostingUrl('https://jobs.ashbyhq.com/meridian')).toBeNull()
    expect(parseBoardPostingUrl('https://boards-api.greenhouse.io/v1/boards/northwind')).toBeNull()
    // The ~57 custom career pages that keep Firecrawl in the product.
    expect(parseBoardPostingUrl('https://careers.google.com/jobs/results/12345')).toBeNull()
    expect(parseBoardPostingUrl('https://openai.com/careers/backend-engineer')).toBeNull()
    expect(parseBoardPostingUrl('not a url at all')).toBeNull()
    expect(parseBoardPostingUrl('')).toBeNull()
  })
})

describe('fetchBoardPosting', () => {
  it('maps a Greenhouse job exactly as the list path does', async () => {
    const listing = await fetchBoardPosting(
      { board: 'greenhouse', org: 'northwind', jobId: GH_ID },
      router(),
    )

    expect(listing).toEqual(await fromSearch('greenhouse:northwind', 'greenhouse', listing.externalId))
    expect(listing.externalId).toBe(`greenhouse-northwind-${GH_ID}`)
    expect(listing.title).toBe('Senior Backend Engineer')
    expect(listing.description).toContain('fleet-coordination')
  })

  it('maps a Lever job exactly as the list path does', async () => {
    const listing = await fetchBoardPosting(
      { board: 'lever', org: 'halcyon', jobId: LEVER_ID },
      router(),
    )

    expect(listing).toEqual(await fromSearch('lever:halcyon', 'lever', listing.externalId))
    expect(listing.title).toBe('Backend Engineer, Payments')
    expect(listing.remote).toBe(true)
  })

  it('fetches the whole Ashby board once and filters to the pasted id', async () => {
    const fetchImpl = router()
    const listing = await fetchBoardPosting(
      { board: 'ashby', org: 'meridian', jobId: ASHBY_ID },
      fetchImpl,
    )

    expect(listing).toEqual(await fromSearch('ashby:meridian', 'ashby', listing.externalId))
    expect(listing.title).toBe('Platform Engineer')
    // Ashby has no per-job endpoint; the board call is the only call there is.
    expect(fetchImpl.calls).toEqual(['https://api.ashbyhq.com/posting-api/job-board/meridian'])
  })

  it('matches an Ashby id case-insensitively, as UUIDs are written both ways', async () => {
    const listing = await fetchBoardPosting(
      { board: 'ashby', org: 'meridian', jobId: ASHBY_ID.toUpperCase() },
      router(),
    )
    expect(listing.externalId).toBe(`ashby-meridian-${ASHBY_ID}`)
  })

  it('says a pulled Greenhouse posting is gone rather than crashing', async () => {
    const error = await fetchBoardPosting(
      { board: 'greenhouse', org: 'northwind', jobId: '9999999' },
      router(),
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(AdapterError)
    expect((error as AdapterError).message).toContain('no longer listed')
    expect((error as AdapterError).retryable).toBe(false)
  })

  it('says the same when an Ashby board no longer carries the posting', async () => {
    const error = await fetchBoardPosting(
      { board: 'ashby', org: 'meridian', jobId: 'ffffffff-0000-0000-0000-000000000000' },
      router(),
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(AdapterError)
    expect((error as AdapterError).message).toContain('no longer listed')
  })

  it('keeps an outage retryable instead of calling it a dead posting', async () => {
    const error = await fetchBoardPosting(
      { board: 'lever', org: 'halcyon', jobId: LEVER_ID },
      router({ 'api.lever.co': async () => new Response('down', { status: 503 }) }),
    ).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(AdapterError)
    expect((error as AdapterError).retryable).toBe(true)
    expect((error as AdapterError).message).not.toContain('no longer listed')
  })
})

describe('ingestBoardPosting', () => {
  it('declines a URL no public board serves, so Firecrawl still gets it', async () => {
    expect(await ingestBoardPosting('https://careers.google.com/jobs/results/1', router())).toBeNull()
  })

  it('lands an Ashby paste in the pipeline with no key configured', async () => {
    const pulled = await ingestBoardPosting(
      `https://jobs.ashbyhq.com/meridian/${ASHBY_ID}`,
      router(),
    )

    expect(pulled).not.toBeNull()
    expect(pulled?.job.title).toBe('Platform Engineer')
    expect(pulled?.job.company).toBe('Meridian Health')
    expect(pulled?.job.jdText).toContain('Kubernetes')
    expect(pulled?.application.jobId).toBe(pulled?.job.id)

    // 'paste', not 'api'. hunt read this from Ashby's own API, but the user
    // pasted a link — and Job.source is shown back to them on the application
    // page, where "from api" about a link they typed reads as wrong.
    expect(pulled?.job.source).toBe('paste')
  })

  it('stores the board’s own canonical link, so a legacy paste is not a second row', async () => {
    const legacy = await ingestBoardPosting(
      `https://boards.greenhouse.io/northwind/jobs/${GH_ID}?gh_src=twitter`,
      router(),
    )
    expect(legacy?.job.url).toBe(`https://job-boards.greenhouse.io/northwind/jobs/${GH_ID}`)

    const current = await ingestBoardPosting(
      `https://job-boards.greenhouse.io/northwind/jobs/${GH_ID}`,
      router(),
    )
    expect(current?.job.id).toBe(legacy?.job.id)
    expect(
      await prisma.job.count({
        where: { url: `https://job-boards.greenhouse.io/northwind/jobs/${GH_ID}` },
      }),
    ).toBe(1)
  })

  it('surfaces a pulled posting as gone rather than writing a half row', async () => {
    const before = await prisma.job.count()

    await expect(
      ingestBoardPosting(`https://jobs.lever.co/halcyon/00000000-dead-dead-dead-000000000000`, router()),
    ).rejects.toThrow(/no longer listed/)

    expect(await prisma.job.count()).toBe(before)
  })
})
