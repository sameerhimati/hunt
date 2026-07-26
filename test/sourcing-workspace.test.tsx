// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { sortResults, type SourcingSort } from '@/components/sourcing/result-list'
import { SourcingWorkspace } from '@/components/sourcing/workspace'
import type { FitRating } from '@/lib/fit/rate'
import type { JobListing, SourcedResult } from '@/lib/sourcing/types'

/**
 * The sourcing workspace is a state machine over three server actions, and its
 * states are the product: results arrive before ratings, a missing key degrades
 * instead of hiding, an adapter failure is quoted rather than swallowed. Each
 * test drives one of those states with the actions stubbed, so nothing here
 * needs a database, a board key or a model.
 */

const searchAction = vi.fn()
const rateAction = vi.fn()
const pullAction = vi.fn()
const saveSearchAction = vi.fn()
const runSavedSearchAction = vi.fn()
const deleteSearchAction = vi.fn()
// Called once on mount to reconcile the chip row; every test starts it agreeing
// with the server-rendered `savedSearches` so it changes nothing on its own.
const listSavedSearchesAction = vi.fn()

vi.mock('@/app/sourcing/actions', () => ({
  searchAction: (...args: unknown[]) => searchAction(...args),
  rateAction: (...args: unknown[]) => rateAction(...args),
  pullAction: (...args: unknown[]) => pullAction(...args),
  saveSearchAction: (...args: unknown[]) => saveSearchAction(...args),
  runSavedSearchAction: (...args: unknown[]) => runSavedSearchAction(...args),
  deleteSearchAction: (...args: unknown[]) => deleteSearchAction(...args),
  listSavedSearchesAction: (...args: unknown[]) => listSavedSearchesAction(...args),
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const success = vi.fn()
const error = vi.fn()
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) } }))

beforeAll(() => {
  // Radix reaches for APIs jsdom doesn't implement.
  Element.prototype.scrollIntoView = vi.fn()
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const listing = (overrides: Partial<JobListing> = {}): JobListing => ({
  externalId: 'a-1',
  title: 'Backend Engineer, Payments',
  company: 'Northwind',
  url: 'https://jobs.example.com/a-1',
  source: 'jsearch',
  ...overrides,
})

const rating = (tier: FitRating['tier']): FitRating => ({
  tier,
  reasons: [{ text: 'Go and distributed systems, both in your résumé.', citations: ['skills[0].items[0]'], gap: false }],
})

/** A promise plus the switch that settles it — for asserting on an in-flight state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderWorkspace(props: Partial<Parameters<typeof SourcingWorkspace>[0]> = {}) {
  return render(
    <SourcingWorkspace
      savedSearches={[]}
      resumeVersionId="version-1"
      jobProviders={['jsearch']}
      {...props}
    />,
  )
}

const runSearch = async (keywords = 'backend') => {
  fireEvent.change(screen.getByTestId('search-keywords'), { target: { value: keywords } })
  fireEvent.click(screen.getByTestId('search-jobs'))
}

beforeEach(() => {
  vi.clearAllMocks()
  searchAction.mockResolvedValue({ listings: [listing()] })
  rateAction.mockResolvedValue({ ratings: [] })
  pullAction.mockResolvedValue({ applicationId: 'app-1' })
  // Storage agrees with what the page server-rendered, which is the ordinary
  // case; the reconcile is only interesting when a save was still in flight.
  listSavedSearchesAction.mockResolvedValue([])
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

describe('sourcing workspace', () => {
  it('starts on a first-run state, not an empty pane', () => {
    renderWorkspace()

    expect(screen.getByText(/The boards are quiet until you ask\./)).toBeTruthy()
    expect(screen.queryByTestId('sourcing-result')).toBeNull()
  })

  it('shows skeleton rows while the boards are answering', async () => {
    const search = deferred<{ listings: JobListing[] }>()
    searchAction.mockReturnValue(search.promise)

    renderWorkspace()
    await runSearch()

    expect(await screen.findByTestId('result-skeletons')).toBeTruthy()
    expect(screen.getByTestId('result-summary').textContent).toContain('searching the boards')

    search.resolve({ listings: [listing()] })
    await waitFor(() => expect(screen.queryByTestId('result-skeletons')).toBeNull())
  })

  it('renders cards unrated first, then fills the badges in', async () => {
    const rate = deferred<{ ratings: { externalId: string; rating: FitRating }[] }>()
    rateAction.mockReturnValue(rate.promise)

    renderWorkspace()
    await runSearch()

    // The whole point of the two-stage arrival: the card is on screen and the
    // model has not answered yet.
    await waitFor(() => expect(screen.getAllByTestId('sourcing-result')).toHaveLength(1))
    expect(screen.queryByTestId('fit-tier-badge')).toBeNull()
    expect(screen.getByTestId('result-summary').textContent).toContain('rating for fit')

    rate.resolve({ ratings: [{ externalId: 'a-1', rating: rating('strong') }] })

    expect(await screen.findByTestId('fit-tier-badge')).toBeTruthy()
    expect(screen.getByTestId('result-summary').textContent).toContain('rated for fit')
  })

  it('says why nothing is rated instead of inventing a tier', async () => {
    rateAction.mockResolvedValue({
      ratings: [],
      degraded: 'Fit rating needs a language model. Add an Anthropic key in Settings.',
    })

    renderWorkspace()
    await runSearch()

    const note = await screen.findByTestId('rating-unavailable')
    expect(note.textContent).toContain('Add an Anthropic key in Settings')
    expect(screen.getByTestId('sourcing-result')).toBeTruthy()
    expect(screen.queryByTestId('fit-tier-badge')).toBeNull()
  })

  it('offers to widen the search when nothing matched', async () => {
    searchAction.mockResolvedValue({ listings: [] })

    renderWorkspace()
    fireEvent.change(screen.getByTestId('search-keywords'), { target: { value: 'quantum farrier' } })
    fireEvent.click(screen.getByTestId('search-jobs'))

    expect(await screen.findByText('Nothing matched — widen the search.')).toBeTruthy()
    expect(screen.queryByTestId('sourcing-result')).toBeNull()
  })

  it('keeps the search visible and the results live when no job key is configured', () => {
    renderWorkspace({ jobProviders: [] })

    expect(screen.getByTestId('degraded-banner')).toBeTruthy()
    // Gated, never hidden — the user can see what a key would unlock.
    expect(screen.getByTestId('search-keywords')).toBeTruthy()
  })

  it('quotes an adapter failure inline and retries from the same screen', async () => {
    searchAction.mockResolvedValueOnce({ error: 'JSearch returned 402 — over plan limit' })

    renderWorkspace()
    await runSearch()

    const inline = await screen.findByTestId('sourcing-error')
    expect(inline.textContent).toContain('JSearch returned 402 — over plan limit')

    searchAction.mockResolvedValue({ listings: [listing()] })
    fireEvent.click(screen.getByTestId('retry-search'))

    await waitFor(() => expect(screen.queryByTestId('sourcing-error')).toBeNull())
    expect(screen.getByTestId('sourcing-result')).toBeTruthy()
    expect(searchAction).toHaveBeenCalledTimes(2)
  })

  it('pulls a listing in optimistically and links to the new card', async () => {
    const pullPromise = deferred<{ applicationId: string }>()
    pullAction.mockReturnValue(pullPromise.promise)

    renderWorkspace()
    await runSearch()

    const button = await screen.findByTestId('pull-into-pipeline')
    fireEvent.click(button)

    await waitFor(() => expect(screen.getByTestId('pull-into-pipeline').textContent).toContain('Pulling'))

    pullPromise.resolve({ applicationId: 'app-7' })
    await waitFor(() => expect(success).toHaveBeenCalled())

    const [, options] = success.mock.calls[0] as [string, { action: { onClick: () => void } }]
    options.action.onClick()
    expect(push).toHaveBeenCalledWith('/applications/app-7')
  })

  it('leaves the card intact when the pull fails', async () => {
    pullAction.mockResolvedValue({ error: 'Job already in your pipeline' })

    renderWorkspace()
    await runSearch()

    fireEvent.click(await screen.findByTestId('pull-into-pipeline'))

    await waitFor(() => expect(error).toHaveBeenCalledWith('Job already in your pipeline'))
    expect(screen.getByTestId('sourcing-result')).toBeTruthy()
    expect((screen.getByTestId('pull-into-pipeline') as HTMLButtonElement).disabled).toBe(false)
  })

  it('drops a rating that lands after a newer search', async () => {
    const first = deferred<{ ratings: { externalId: string; rating: FitRating }[] }>()
    rateAction.mockReturnValueOnce(first.promise).mockResolvedValue({ ratings: [] })

    renderWorkspace()
    await runSearch('backend')
    await waitFor(() => expect(screen.getAllByTestId('sourcing-result')).toHaveLength(1))

    searchAction.mockResolvedValue({ listings: [listing({ externalId: 'b-2', title: 'Infra' })] })
    await runSearch('infra')
    await waitFor(() => expect(screen.getByText('Infra')).toBeTruthy())

    // The stale batch answers late, for listings nobody is looking at any more.
    first.resolve({ ratings: [{ externalId: 'a-1', rating: rating('strong') }] })

    await waitFor(() => expect(screen.queryByTestId('fit-tier-badge')).toBeNull())
    expect(screen.getByText('Infra')).toBeTruthy()
  })

  it('picks up a save that landed after the page was rendered', async () => {
    // Saving is a round trip and the user may reload before it finishes: the
    // browser cancels the request, the write still lands, and the render in
    // between reads storage a moment too early. The row has to catch up.
    listSavedSearchesAction.mockResolvedValue([
      { id: 'ss_1', label: 'platform', query: { keywords: 'platform' }, createdAt: '2026-07-24T00:00:00.000Z' },
    ])

    renderWorkspace({ savedSearches: [] })

    await waitFor(() => expect(screen.getByTestId('saved-search-chip').textContent).toBe('platform'))
  })
})

describe('result ordering', () => {
  const result = (externalId: string, tier?: FitRating['tier'], postedAt?: Date): SourcedResult => ({
    listing: listing({ externalId, postedAt }),
    rating: tier ? rating(tier) : undefined,
  })

  const ids = (results: SourcedResult[], sort: SourcingSort) =>
    sortResults(results, sort).map((entry) => entry.listing.externalId)

  it('puts strong before possible before reach, and unrated last', () => {
    const results = [result('unrated'), result('reach', 'reach'), result('possible', 'possible'), result('strong', 'strong')]

    expect(ids(results, 'fit')).toEqual(['strong', 'possible', 'reach', 'unrated'])
  })

  it('keeps adapter order within a tier', () => {
    const results = [result('a', 'strong'), result('b', 'strong'), result('c', 'possible')]

    expect(ids(results, 'fit')).toEqual(['a', 'b', 'c'])
  })

  it('sorts newest first and sinks listings with no posted date', () => {
    const results = [
      result('old', undefined, new Date('2026-01-01')),
      result('undated'),
      result('new', undefined, new Date('2026-07-01')),
    ]

    expect(ids(results, 'newest')).toEqual(['new', 'old', 'undated'])
  })
})
