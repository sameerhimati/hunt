'use client'

import { OctagonX } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  deleteSearchAction,
  listSavedSearchesAction,
  pullAction,
  rateAction,
  runSavedSearchAction,
  saveSearchAction,
  searchAction,
  type SearchActionResult,
} from '@/app/sourcing/actions'
import { DegradedBanner } from '@/components/degraded-banner'
import { EmptyState } from '@/components/empty-state'
import { ResultList, type SourcingSort } from '@/components/sourcing/result-list'
import { SavedSearches } from '@/components/sourcing/saved-searches'
import { SearchBar } from '@/components/sourcing/search-bar'
import { Button, buttonVariants } from '@/components/ui/button'
import type { JobListing, JobQuery, SavedSearch, SourcedResult } from '@/lib/sourcing/types'
import { cn } from '@/lib/utils'

/**
 * The sourcing screen's client half: query state, the two-step search
 * (listings first, ratings second), and the pull-in.
 *
 * The two steps are the point. `design/Sourcing.dc.html` shows rated cards, but
 * a batch LLM call takes seconds — so results render the moment the boards
 * answer, unrated, and fit tiers fill in when `rateAction` returns. Blocking the
 * list on the model would make the fast part feel as slow as the slow part, and
 * a card with no rating is honest: it says nothing rather than guessing.
 *
 * Every state on this screen is designed, not defaulted (DESIGN.md §8):
 * first-run, searching (skeleton rows in the shape of the cards), nothing
 * matched, no job key (banner + dimmed controls, results never hidden), rating
 * unavailable (cards with no badge and one quiet line about what would unlock
 * it), and adapter error (verbatim reason, inline, retryable, results intact).
 */
export interface SourcingWorkspaceProps {
  savedSearches: SavedSearch[]
  /** The résumé version results are rated against; null when no résumé exists yet. */
  resumeVersionId: string | null
  /** Configured job-provider ids (`jsearch`, `adzuna`, …). Empty ⇒ degraded. */
  jobProviders: string[]
}

export function SourcingWorkspace({
  savedSearches,
  resumeVersionId,
  jobProviders,
}: SourcingWorkspaceProps) {
  const router = useRouter()

  const [query, setQuery] = useState<JobQuery>({ keywords: '' })
  const [results, setResults] = useState<SourcedResult[]>([])
  const [sort, setSort] = useState<SourcingSort>('fit')
  const [saved, setSaved] = useState<SavedSearch[]>(savedSearches)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [ratingNote, setRatingNote] = useState<string | null>(null)

  // The screen has two arrivals — the boards answering, then the model — and
  // they must stay independent. The search deliberately does *not* use
  // `useTransition`: React entangles every transition started inside an async
  // one, so a rating fired from within a search transition would hold
  // `searching` true until the model replied and the skeletons would sit on top
  // of results that had already arrived. That is precisely the wait this design
  // removes. Plain state for the search, a transition for the rating.
  const [searching, setSearching] = useState(false)
  const [rating, startRating] = useTransition()

  // Which search owns the screen. A rating that resolves after a newer search
  // started is dropped rather than painted onto the wrong listings.
  const runRef = useRef(0)

  // The chips arrive server-rendered so the row paints with the page; this
  // re-reads them once the client is running.
  //
  // Saving is a round trip, and the user is free to reload or move on before it
  // lands — the browser cancels the request, the server finishes the write
  // anyway, and the render in between reads storage a moment too early. Without
  // this the row would stay one chip short until something else re-rendered the
  // page. It also picks up a chip saved in another tab: same SQLite file, same
  // list. Ids are compared so an unchanged list doesn't re-render the row.
  useEffect(() => {
    let live = true

    void listSavedSearchesAction().then((stored) => {
      if (!live) return
      setSaved((current) =>
        current.length === stored.length && current.every((item, i) => item.id === stored[i].id)
          ? current
          : stored,
      )
    })

    return () => {
      live = false
    }
  }, [])

  const degraded = jobProviders.length === 0

  /** Show the listings immediately, then fill in the tiers when the model answers. */
  const show = (listings: JobListing[]) => {
    const runId = ++runRef.current

    setResults(listings.map((listing) => ({ listing })))
    setRatingNote(null)
    if (listings.length === 0) return

    startRating(async () => {
      const { ratings, degraded: unavailable } = await rateAction(listings, resumeVersionId)
      if (runRef.current !== runId) return

      // No rating is a state, not a value: the cards keep their absent badge and
      // the reason is said once, in words. Inventing a tier here would be the
      // one lie this product doesn't tell.
      if (unavailable) {
        setRatingNote(unavailable)
        return
      }

      const byId = new Map(ratings.map((rated) => [rated.externalId, rated.rating]))
      setResults(listings.map((listing) => ({ listing, rating: byId.get(listing.externalId) })))
    })
  }

  /** One search lifecycle, whichever control started it. */
  const run = async (fetch: () => Promise<SearchActionResult>, onListings?: () => void) => {
    // Clear first: a second search must not leave the previous batch on screen
    // under a "searching" header, pretending to be the answer to this query.
    runRef.current += 1
    setResults([])
    setSearchError(null)
    setRatingNote(null)
    setSearching(true)

    try {
      const { listings, error } = await fetch()
      setSearched(true)

      // A failed board leaves the query in the box and the reason on the screen.
      if (error) {
        setSearchError(error)
        return
      }

      onListings?.()
      show(listings ?? [])
    } finally {
      setSearching(false)
    }
  }

  /** `next` is only ever passed by "widen the search" — never wire it to an event handler. */
  const runSearch = (next: JobQuery = query) =>
    void run(
      () => searchAction(next),
      () => setActiveId(null),
    )

  const runSaved = (id: string) =>
    void run(
      () => runSavedSearchAction(id),
      () => {
        // The chip's query goes back into the box, so the next search starts
        // from what the user just ran rather than from whatever was typed.
        const chip = saved.find((item) => item.id === id)
        if (chip) setQuery(chip.query)
        setActiveId(id)
      },
    )

  /** Retry re-runs whatever produced the error — the chip if one is active, else the box. */
  const retry = () => (activeId ? runSaved(activeId) : runSearch())

  const save = async () => {
    const { saved: entry, error } = await saveSearchAction(query)
    if (error || !entry) {
      toast.error(error ?? 'Could not save that search.')
      return
    }

    setSaved((current) =>
      current.some((item) => item.id === entry.id) ? current : [entry, ...current],
    )
    setActiveId(entry.id)
  }

  const remove = async (id: string) => {
    const { error } = await deleteSearchAction(id)
    if (error) {
      toast.error(error)
      return
    }

    setSaved((current) => current.filter((item) => item.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const pull = (result: SourcedResult) => {
    const id = result.listing.externalId
    setPendingIds((current) => new Set(current).add(id))

    void pullAction(result.listing, result.rating)
      .then(({ applicationId, error }) => {
        // A failed pull changes nothing on screen: the card stays exactly where
        // it was, still pullable, and the reason is named.
        if (error || !applicationId) {
          toast.error(error ?? 'Could not add that job to your pipeline.')
          return
        }

        toast.success(`${result.listing.title} is on the board, in Sourced.`, {
          action: {
            label: 'Open',
            onClick: () => router.push(`/applications/${applicationId}`),
          },
        })
      })
      .finally(() => {
        setPendingIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      })
  }

  const showList = searching || results.length > 0
  const nothingMatched = searched && !searching && !searchError && results.length === 0
  const canWiden = Boolean(query.location?.trim()) || Boolean(query.remoteOnly)

  /** The empty state's one action: drop the filters that can starve a query, and re-run. */
  const widen = () => {
    const widened: JobQuery = { ...query, location: '', remoteOnly: false }
    setQuery(widened)
    runSearch(widened)
  }

  return (
    <div className="flex flex-col gap-3.5">
      {degraded ? (
        <DegradedBanner
          feature="Searching the job boards"
          needs="a JSearch or Adzuna key"
          stillWorks="Company boards (Greenhouse, Lever, Ashby) are already searchable without one, and you can add any job by pasting its URL."
          settingsSection="jobs"
        />
      ) : null}

      {/*
        Degraded dims the controls rather than hiding them (`System States` §02):
        the user sees exactly what a key would unlock. Results stay live and
        outside the dim — pulling a listing into the pipeline needs no key.
      */}
      <div
        className={
          degraded ? 'pointer-events-none opacity-40 grayscale-[0.3] transition-opacity' : undefined
        }
      >
        <SearchBar
          value={query}
          onChange={setQuery}
          onSearch={() => runSearch()}
          searching={searching}
        />
      </div>

      <SavedSearches
        saved={saved}
        activeId={activeId}
        onRun={runSaved}
        onSave={save}
        onDelete={remove}
      />

      {searchError ? (
        <div
          data-testid="sourcing-error"
          className="flex gap-3.5 rounded-lg border border-diff-del/30 bg-diff-del-bg px-4 py-3.5"
        >
          <OctagonX size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-diff-del" />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Couldn’t search the boards</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The provider said{' '}
              <span className="font-mono text-xs text-diff-del">{searchError}</span>. Your query is
              still in the box — nothing was lost.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={retry} data-testid="retry-search">
                Retry
              </Button>
              <Link
                href="/settings"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Job-board settings
              </Link>
              <Link
                href="/pipeline"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
              >
                Add a job by URL
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {showList ? (
        <ResultList
          results={results}
          sort={sort}
          onSortChange={setSort}
          onPull={pull}
          pendingIds={pendingIds}
          searching={searching}
          rating={rating}
          ratingUnavailable={ratingNote}
        />
      ) : null}

      {nothingMatched ? (
        <EmptyState
          className="py-12"
          title="Nothing matched — widen the search."
          body="Fewer keywords reach further. A location or the remote filter can narrow the boards down to nothing on their own."
          action={
            canWiden ? (
              <Button size="sm" variant="outline" onClick={widen} data-testid="widen-search">
                Drop the filters and search again
              </Button>
            ) : (
              <Link
                href="/pipeline"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                Add a job by URL instead
              </Link>
            )
          }
        />
      ) : null}

      {!searched && !searching && results.length === 0 && !searchError ? (
        <EmptyState
          className="py-12"
          title="The boards are quiet until you ask."
          body="Search a role — “backend engineer” — and the postings land straight away. Fit ratings against your résumé fill in a moment later."
        />
      ) : null}
    </div>
  )
}
