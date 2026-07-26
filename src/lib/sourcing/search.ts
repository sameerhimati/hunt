import { createAdapter } from '@/lib/adapters/factory'
import type { Adapter } from '@/lib/adapters/types'

import type { JobListing, JobQuery, JobsAdapter, SearchOptions } from './types'

/**
 * Multi-adapter job search — one query, every configured board, one list.
 *
 * Three properties the rest of sourcing depends on:
 *   - **Partial failure is normal.** Boards rate-limit. A JSearch 429 costs the
 *     user JSearch's results and nothing else; Adzuna's listings still render.
 *     Everything fails ⇒ the first error is thrown, so the screen can show a
 *     real reason instead of an empty state that looks like "no jobs match".
 *   - **Dedupe is two-keyed.** `externalId` catches the same provider answering
 *     twice; a normalised URL catches JSearch and a free board handing back the
 *     same posting under different ids. First adapter wins, so output order is
 *     the adapter order and a re-run doesn't reshuffle the page.
 *   - **It works with zero keys.** `free_boards` needs no credential, so the
 *     adapter list is never empty — sourcing is useful before the user has
 *     bought anything.
 */

/** The job providers sourcing searches, in the order their results are merged. */
const JOBS_PROVIDERS = ['jsearch', 'adzuna', 'free_boards'] as const

/**
 * Keyless providers are excluded from `configured`: they prove nothing about
 * what the user has set up, and if free boards counted the DegradedBanner
 * ("add JSearch or Adzuna") could never appear.
 */
const KEYLESS_PROVIDERS = new Set<string>(['free_boards'])

/** Query params that identify the campaign, not the posting. */
const TRACKING_PARAMS = /^(utm_|gh_src$|ref$|referer$|referrer$|source$|src$|fbclid$|gclid$)/i

/** One adapter's outage, kept so the caller can name the provider that failed. */
export interface SearchFailure {
  /** The adapter's id — `jsearch`, `adzuna`, `free_boards`. */
  provider: string
  /** Already user-readable: `AdapterError` messages name the provider and the reason. */
  message: string
  error: unknown
}

function isJobsAdapter(adapter: Adapter | null): adapter is JobsAdapter {
  return adapter !== null && typeof (adapter as JobsAdapter).search === 'function'
}

/**
 * The same posting on two boards rarely arrives as the same string: one adds
 * `?utm_source=`, the other a trailing slash or a `www.`. Normalising to
 * host+path (plus any params that actually select the posting) makes those one
 * listing. Unparseable URLs fall back to the raw string — a bad URL should not
 * collapse two real listings into one.
 */
function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    const host = url.host.toLowerCase().replace(/^www\./, '')
    const path = url.pathname.replace(/\/+$/, '')

    const params = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.test(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&')

    return `${host}${path}${params ? `?${params}` : ''}`
  } catch {
    return raw.trim().toLowerCase()
  }
}

function squash(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Both identities a listing can be recognised by, most specific first.
 *
 * The URL key carries title and company too. A URL on its own is not an
 * identity: boards route several postings through one landing page, and some
 * providers hand back a search URL rather than a permalink — keying on the URL
 * alone would silently swallow distinct roles. Same link *and* same role at the
 * same company is the duplicate we actually mean.
 */
function dedupeKeys(listing: JobListing): string[] {
  const keys = [`id:${listing.externalId}`]
  if (listing.url) {
    keys.push(
      `url:${normalizeUrl(listing.url)}|${squash(listing.title)}|${squash(listing.company)}`,
    )
  }
  return keys
}

/**
 * Merges adapter results in order, keeping the first sighting of each posting.
 *
 * The one thing a later duplicate can contribute is a description: free boards
 * often return a title and a link where JSearch returns the full JD (or the
 * reverse). Fit rating reads the description, so dropping it to preserve
 * "first wins" would make the merged list worse than either input.
 */
function dedupe(batches: JobListing[][]): JobListing[] {
  const merged: JobListing[] = []
  const positions = new Map<string, number>()

  for (const batch of batches) {
    for (const listing of batch) {
      const keys = dedupeKeys(listing)
      const seen = keys.map((key) => positions.get(key)).find((at) => at !== undefined)

      if (seen === undefined) {
        merged.push(listing)
        for (const key of keys) positions.set(key, merged.length - 1)
        continue
      }

      if (!merged[seen].description && listing.description) {
        merged[seen] = { ...merged[seen], description: listing.description }
      }
      // The duplicate's own id/url now point at the surviving entry, so a third
      // adapter matching either identity still collapses into it.
      for (const key of keys) if (!positions.has(key)) positions.set(key, seen)
    }
  }

  return merged
}

/**
 * Runs `query` across the given adapters (or the configured ones) and returns
 * the merged, deduped listings plus whatever failed getting there.
 *
 * Callers that want to name the broken provider ("Adzuna is down; showing
 * JSearch only") read `failures`; `searchJobs` is the shorthand for the ones
 * that just want listings.
 */
export async function searchJobsDetailed(
  query: JobQuery,
  options?: SearchOptions,
): Promise<{ listings: JobListing[]; failures: SearchFailure[] }> {
  const adapters = options?.adapters ?? (await resolveJobsAdapters()).adapters
  if (adapters.length === 0) return { listings: [], failures: [] }

  // allSettled, not all: one board's 429 must cost only that board's results.
  const settled = await Promise.allSettled(adapters.map((adapter) => adapter.search(query)))

  const batches: JobListing[][] = []
  const failures: SearchFailure[] = []

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      batches.push(result.value)
      return
    }
    const error: unknown = result.reason
    failures.push({
      provider: adapters[index].id,
      message: error instanceof Error ? error.message : String(error),
      error,
    })
  })

  // Every board failing is not a partial answer — it is an error, and the user
  // deserves the reason rather than an empty results list.
  if (batches.length === 0 && failures.length > 0) throw failures[0].error

  // Observability: a silently halved result set is indistinguishable from a
  // narrow query. Messages are provider text, never credentials.
  for (const failure of failures) {
    console.warn(`[sourcing] ${failure.provider} search failed: ${failure.message}`)
  }

  return { listings: dedupe(batches), failures }
}

/**
 * Runs `query` across the given adapters (or the configured ones) and returns
 * the merged, deduped listings.
 *
 * `options.adapters` is positional dependency injection, not configuration —
 * gates pass fakes here.
 */
export async function searchJobs(
  query: JobQuery,
  options?: SearchOptions,
): Promise<JobListing[]> {
  return (await searchJobsDetailed(query, options)).listings
}

/**
 * The adapters sourcing would search right now, and the provider ids behind
 * them.
 *
 * Split out from `searchJobs` because the screen needs the answer *before* a
 * search runs: `configured` is what the DegradedBanner reads to say which job
 * boards are live and which key would add another. `adapters` is never empty —
 * free boards need no key — so an empty `configured` means "degraded, but still
 * searching", not "nothing works".
 */
export async function resolveJobsAdapters(): Promise<{
  adapters: JobsAdapter[]
  configured: string[]
}> {
  const resolved = await Promise.all(
    JOBS_PROVIDERS.map(async (id) => ({ id, adapter: await createAdapter(id) })),
  )
  const live = resolved.flatMap((entry) =>
    isJobsAdapter(entry.adapter) ? [{ id: entry.id as string, adapter: entry.adapter }] : [],
  )

  return {
    adapters: live.map((entry) => entry.adapter),
    configured: live.map((entry) => entry.id).filter((id) => !KEYLESS_PROVIDERS.has(id)),
  }
}
