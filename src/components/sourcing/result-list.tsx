'use client'

import { ResultCard } from '@/components/sourcing/result-card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { FitTier } from '@/lib/fit/rate'
import type { SourcedResult } from '@/lib/sourcing/types'

/**
 * The results column: the count/source line, the sort control, and one
 * `<ResultCard>` per listing (`design/Sourcing.dc.html`).
 *
 * It owns ordering only — a card never re-sorts itself, and the empty state
 * ("Nothing matched — widen the search.") belongs to the workspace, which knows
 * whether a search has been run at all.
 *
 * Two honesty rules live here rather than on the cards:
 *   - the header says which stage the screen is in ("rating for fit…" vs
 *     "rated for fit"), so a card with no badge reads as *not rated yet* rather
 *     than *rated badly*;
 *   - when rating can't run at all, the reason is stated once, quietly, above
 *     the list. Never a placeholder tier, never a greyed badge that looks like
 *     a verdict.
 */

/**
 * Sort options. `fit` is the default: it's why the ratings exist.
 *
 * SCREENS §8 also sketches a salary sort, and it isn't here — `JobListing`
 * carries no salary field (`src/lib/adapters/jobs/types.ts`), so a control
 * claiming to order by pay it never received would be the same class of lie as
 * a fake match percentage. It lands the day the adapters parse compensation.
 */
export type SourcingSort = 'fit' | 'newest'

const SORT_LABELS: Record<SourcingSort, string> = {
  fit: 'best fit',
  newest: 'newest',
}

/** Strong, then Possible, then Reach — and everything unrated after them. */
const TIER_RANK: Record<FitTier, number> = { strong: 0, possible: 1, reach: 2 }

function tierRank(result: SourcedResult): number {
  return result.rating ? TIER_RANK[result.rating.tier] : 3
}

/** `postedAt` crosses the action boundary as a Date, but tolerate a string. */
function postedTime(result: SourcedResult): number {
  const posted = result.listing.postedAt
  if (!posted) return Number.NEGATIVE_INFINITY

  const time = new Date(posted).getTime()
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/**
 * Ordering, pure and exported so it can be tested without a DOM.
 *
 * Both sorts are stable (V8's `sort` is), so listings that tie keep the order
 * the adapters returned them in: when the ratings land, the list re-groups by
 * tier without otherwise reshuffling under the user's cursor.
 */
export function sortResults(results: SourcedResult[], sort: SourcingSort): SourcedResult[] {
  const ordered = [...results]

  if (sort === 'newest') {
    ordered.sort((a, b) => postedTime(b) - postedTime(a))
    return ordered
  }

  ordered.sort((a, b) => tierRank(a) - tierRank(b))
  return ordered
}

/** `18 results · rated for fit · jsearch` — the mockup's line, saying only what's true. */
function summarise(
  results: SourcedResult[],
  { searching, rating }: { searching: boolean; rating: boolean },
): string {
  if (searching) return 'searching the boards…'

  const rated = results.filter((result) => result.rating).length
  const sources = [...new Set(results.map((result) => result.listing.source))]

  const parts = [`${results.length} ${results.length === 1 ? 'result' : 'results'}`]
  if (rating) parts.push('rating for fit…')
  else if (rated > 0) parts.push(rated === results.length ? 'rated for fit' : `${rated} rated`)
  if (sources.length > 0) parts.push(sources.join(' · '))

  return parts.join(' · ')
}

export interface ResultListProps {
  results: SourcedResult[]
  sort: SourcingSort
  onSortChange: (sort: SourcingSort) => void
  onPull: (result: SourcedResult) => void
  /** `externalId`s with a pull in flight, so each card can disable its own button. */
  pendingIds: ReadonlySet<string>
  /** A search is running: skeleton rows, never a blank pane with a spinner. */
  searching?: boolean
  /** The batch rating is still out. Cards are already on screen, unrated. */
  rating?: boolean
  /**
   * Why nothing is rated — verbatim from the server (no résumé, no model key).
   * One quiet line; the cards simply carry no badge.
   */
  ratingUnavailable?: string | null
}

/** Card-shaped placeholders: the list arrives in the shape it will keep. */
function SkeletonRows() {
  return (
    <div data-testid="result-skeletons" className="flex flex-col gap-2.5">
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="flex items-center gap-3.5 rounded-lg border border-border bg-card px-4 py-3.5"
        >
          <Skeleton className="size-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[42%]" />
            <Skeleton className="h-3 w-[64%]" />
          </div>
          <Skeleton className="h-8 w-32 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export function ResultList({
  results,
  sort,
  onSortChange,
  onPull,
  pendingIds,
  searching = false,
  rating = false,
  ratingUnavailable = null,
}: ResultListProps) {
  const ordered = sortResults(results, sort)

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span data-testid="result-summary" className="font-mono text-xs text-muted-foreground">
          {summarise(results, { searching, rating })}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid="sourcing-sort"
            disabled={results.length === 0}
            className="font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:opacity-50"
          >
            sort: <span className="text-foreground">{SORT_LABELS[sort]}</span> ▾
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            {(Object.keys(SORT_LABELS) as SourcingSort[]).map((option) => (
              <DropdownMenuItem
                key={option}
                data-testid={`sort-${option}`}
                onSelect={() => onSortChange(option)}
              >
                {SORT_LABELS[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {ratingUnavailable ? (
        <p data-testid="rating-unavailable" className="mb-3 text-sm leading-relaxed text-faint">
          {ratingUnavailable}
        </p>
      ) : null}

      {searching ? (
        <SkeletonRows />
      ) : (
        <div className="flex flex-col gap-2.5">
          {ordered.map((result) => (
            <ResultCard
              key={result.listing.externalId}
              result={result}
              onPull={onPull}
              pulling={pendingIds.has(result.listing.externalId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
