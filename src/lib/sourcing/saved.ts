import { prisma } from '@/lib/db/client'
import { readSetting, writeSetting } from '@/lib/settings/store'

import { searchJobs } from './search'
import { SAVED_SEARCHES_KEY } from './types'
import type { JobListing, JobQuery, SavedSearch, SearchOptions } from './types'

/**
 * Saved searches — the habit loop. A job hunt is the same three queries run
 * every few days, so re-running one is a chip, not a re-typed form.
 *
 * Storage: there is no SavedSearch table and `prisma/schema.prisma` is frozen
 * for this phase. The whole list round-trips as a JSON array under
 * `SAVED_SEARCHES_KEY` in the Setting table. Runs are different: each execution
 * writes a `SourcingRun` row, because "what did this query return on Tuesday"
 * is history worth keeping.
 */

/**
 * The identity of a query, for dedupe.
 *
 * Case and surrounding whitespace are typing noise, not intent — `Backend ` and
 * `backend` are the same saved search. `page` is deliberately excluded: it is
 * pagination state, not part of what the user asked for.
 */
function queryKey(query: JobQuery): string {
  return JSON.stringify({
    keywords: query.keywords.trim().toLowerCase(),
    location: query.location?.trim().toLowerCase() ?? '',
    remoteOnly: query.remoteOnly === true,
  })
}

function newId(): string {
  return `ss_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

async function readAll(): Promise<SavedSearch[]> {
  const raw = await readSetting(SAVED_SEARCHES_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    // A hand-edited or half-written setting must not take the whole screen
    // down; an unreadable list is an empty list.
    return Array.isArray(parsed) ? (parsed as SavedSearch[]) : []
  } catch {
    return []
  }
}

async function writeAll(searches: SavedSearch[]): Promise<void> {
  await writeSetting({ key: SAVED_SEARCHES_KEY, value: JSON.stringify(searches), secret: false })
}

/**
 * Persists `query` and returns the stored row. Saving the same query twice
 * returns the existing entry rather than growing a wall of identical chips.
 * No label is stored — the chip re-derives it from the query at render, so it
 * always reads as the search it will actually re-run.
 */
export async function saveSearch(query: JobQuery): Promise<SavedSearch> {
  const searches = await readAll()
  const key = queryKey(query)

  const existing = searches.find((saved) => queryKey(saved.query) === key)
  if (existing) return existing

  const saved: SavedSearch = {
    id: newId(),
    query,
    createdAt: new Date().toISOString(),
  }
  await writeAll([saved, ...searches])
  return saved
}

/** Newest first — the chip row in `design/Sourcing.dc.html`. */
export async function listSavedSearches(): Promise<SavedSearch[]> {
  // `readAll` is already newest-first (saves prepend); sorting makes that
  // explicit and survives a list that was written by an older shape.
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Which adapters answered. Derived from the listings' own `source`, so the row
 * records who actually produced results; when nothing came back there is no
 * source to read, so it falls back to who was asked.
 */
function adapterLabel(listings: JobListing[], options?: SearchOptions): string {
  const answered = [...new Set(listings.map((listing) => listing.source))].sort()
  if (answered.length > 0) return answered.join(',')
  return (options?.adapters ?? [])
    .map((adapter) => adapter.id)
    .sort()
    .join(',')
}

/**
 * Re-runs a saved query and records the execution.
 *
 * The returned `id` is the **`SourcingRun` row id**, not the saved search's —
 * callers (and the exit gate) look it up in `prisma.sourcingRun`. `resultCount`
 * is the count of the listings actually returned (post-dedupe), so the number
 * the user sees and the number in the run history are the same number.
 *
 * `options` passes straight through to `searchJobs`, so an injected adapter set
 * is what actually runs.
 */
export async function runSavedSearch(
  id: string,
  options?: SearchOptions,
): Promise<{ id: string; resultCount: number; listings: JobListing[] }> {
  const searches = await readAll()
  const saved = searches.find((entry) => entry.id === id)
  if (!saved) throw new Error(`No saved search with id "${id}"`)

  const listings = await searchJobs(saved.query, options)

  // Recorded even when nothing came back: a saved search that stopped matching
  // is exactly the fact the user needs to see in the run history.
  const run = await prisma.sourcingRun.create({
    data: {
      query: JSON.stringify(saved.query),
      adapter: adapterLabel(listings, options),
      resultCount: listings.length,
    },
  })

  return { id: run.id, resultCount: listings.length, listings }
}

/** Removes a saved search. Its past `SourcingRun` rows survive — that's history. */
export async function deleteSavedSearch(id: string): Promise<void> {
  const searches = await readAll()
  await writeAll(searches.filter((saved) => saved.id !== id))
}
