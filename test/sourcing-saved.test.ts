import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeJobsAdapter } from '@/lib/adapters/jobs/fake'
import { prisma } from '@/lib/db/client'
import { describeQuery } from '@/lib/sourcing/types'
import type { JobListing, JobQuery, SearchOptions } from '@/lib/sourcing/types'

/**
 * `searchJobs` belongs to a sibling leaf (P5.a). This file is about saved
 * searches, so it runs against the real implementation when there is one and
 * falls back to a minimal stand-in — fan out to the injected adapters, dedupe
 * by `externalId` — while that leaf is still a stub. Only the stub's exact
 * "not implemented" is swallowed; a real failure inside search still fails
 * these tests.
 */
vi.mock('@/lib/sourcing/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sourcing/search')>()
  return {
    ...actual,
    searchJobs: async (query: JobQuery, options?: SearchOptions): Promise<JobListing[]> => {
      try {
        return await actual.searchJobs(query, options)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'not implemented') throw error
        const merged = new Map<string, JobListing>()
        for (const adapter of options?.adapters ?? []) {
          for (const listing of await adapter.search(query)) {
            if (!merged.has(listing.externalId)) merged.set(listing.externalId, listing)
          }
        }
        return [...merged.values()]
      }
    },
  }
})

const { deleteSavedSearch, listSavedSearches, runSavedSearch, saveSearch } = await import(
  '@/lib/sourcing/saved'
)
const { SAVED_SEARCHES_KEY } = await import('@/lib/sourcing/types')
const { deleteSetting } = await import('@/lib/settings/store')

beforeEach(async () => {
  // Saved searches are one row shared by every test in the file.
  await deleteSetting(SAVED_SEARCHES_KEY)
})

describe('saveSearch / listSavedSearches', () => {
  it('round-trips a query the chip can name', async () => {
    const saved = await saveSearch({ keywords: 'backend', remoteOnly: true })

    expect(saved.id).toBeTruthy()
    // The label is derived at render, never stored — the chip has to read as the
    // query it will re-run, so the query is the thing worth asserting on.
    expect(describeQuery(saved.query)).toBe('backend · remote')
    expect(saved.query).toEqual({ keywords: 'backend', remoteOnly: true })

    const list = await listSavedSearches()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(saved.id)
  })

  it('returns the existing chip instead of stacking an identical query', async () => {
    const first = await saveSearch({ keywords: 'backend', remoteOnly: true })
    const again = await saveSearch({ keywords: '  Backend ', remoteOnly: true })

    expect(again.id).toBe(first.id)
    expect(await listSavedSearches()).toHaveLength(1)
  })

  it('keeps a genuinely different query as its own chip, newest first', async () => {
    await saveSearch({ keywords: 'backend', remoteOnly: true })
    const second = await saveSearch({ keywords: 'platform', location: 'SF' })

    const list = await listSavedSearches()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe(second.id)
    expect(describeQuery(list[0].query)).toBe('platform · SF')
  })
})

describe('runSavedSearch', () => {
  it('records a SourcingRun whose count matches the listings returned', async () => {
    const saved = await saveSearch({ keywords: 'backend', remoteOnly: true })
    const adapter = new FakeJobsAdapter()

    const run = await runSavedSearch(saved.id, { adapters: [adapter] })

    expect(run.resultCount).toBeGreaterThan(0)
    expect(run.resultCount).toBe(run.listings.length)
    // The options went through to search, not around it.
    expect(adapter.queries).toEqual([{ keywords: 'backend', remoteOnly: true }])

    const row = await prisma.sourcingRun.findUnique({ where: { id: run.id } })
    expect(row).toBeTruthy()
    expect(row?.resultCount).toBe(run.resultCount)
    expect(JSON.parse(row!.query)).toEqual({ keywords: 'backend', remoteOnly: true })
    expect(row?.adapter).toContain('fake-jobs')
  })

  it('records the run even when the query has stopped matching anything', async () => {
    const saved = await saveSearch({ keywords: 'underwater basket weaving' })

    const run = await runSavedSearch(saved.id, { adapters: [new FakeJobsAdapter()] })

    expect(run.resultCount).toBe(0)
    const row = await prisma.sourcingRun.findUnique({ where: { id: run.id } })
    expect(row?.resultCount).toBe(0)
  })

  it('names the id it could not find', async () => {
    await expect(runSavedSearch('ss_nope', { adapters: [new FakeJobsAdapter()] })).rejects.toThrow(
      /ss_nope/,
    )
  })
})

describe('deleteSavedSearch', () => {
  it('removes the chip but leaves its run history alone', async () => {
    const saved = await saveSearch({ keywords: 'backend', remoteOnly: true })
    const run = await runSavedSearch(saved.id, { adapters: [new FakeJobsAdapter()] })

    await deleteSavedSearch(saved.id)

    expect(await listSavedSearches()).toHaveLength(0)
    expect(await prisma.sourcingRun.findUnique({ where: { id: run.id } })).toBeTruthy()
  })
})
