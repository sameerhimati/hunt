import type { JobListing, JobsAdapter, JobQuery } from '@/lib/adapters/jobs/types'
import type { FitRating } from '@/lib/fit/rate'

/**
 * The sourcing vocabulary — the shapes search, batch rating, pull-in and saved
 * searches all agree on.
 *
 * Nothing here redefines a listing. `JobQuery` and `JobListing` are the job
 * adapters' own types, re-exported so sourcing code has one import path; a
 * second, sourcing-flavoured "Listing" interface would drift from the adapter
 * contract the moment a provider grew a field, and the dedupe key
 * (`externalId`) belongs to the adapter layer, not to this one.
 */

export type { JobListing, JobQuery, JobsAdapter } from '@/lib/adapters/jobs/types'

/**
 * Dependency injection for the two entry points that hit the network.
 *
 * Adapters are injected rather than resolved when a caller already knows which
 * ones it wants — gates pass `FakeJobsAdapter`s so the whole search path runs
 * with no keys and no network. Omitted, `searchJobs` resolves whatever the user
 * has configured (see `resolveJobsAdapters`), including the keyless free-boards
 * tier that makes sourcing work before any key exists.
 */
export interface SearchOptions {
  adapters?: JobsAdapter[]
}

/**
 * A listing as the sourcing board renders it: the posting, plus the fit rating
 * once it arrives.
 *
 * `rating` is optional because results land before the model has read them —
 * cards appear unrated and fill in, rather than the page blocking on a batch
 * LLM call. A `FitRating` is a tier and cited reasons and is structurally
 * incapable of carrying a number; see `src/lib/fit/rate.ts`. Do not widen it.
 */
export interface SourcedResult {
  listing: JobListing
  rating?: FitRating
}

/** A query the user chose to keep, so re-running the search is one click. */
export interface SavedSearch {
  id: string
  /** The chip label — `describeQuery(query)` at save time. */
  label: string
  query: JobQuery
  /** ISO 8601. A string because this row round-trips through JSON in Setting. */
  createdAt: string
}

/**
 * Where saved searches live.
 *
 * There is no SavedSearch table: `prisma/schema.prisma` is frozen for this
 * phase, so the whole list persists as one JSON array under a single Setting
 * key via `readSetting`/`writeSetting`. A handful of saved queries is not worth
 * a migration, and the Setting table is already the home for local, single-user
 * config. (`SourcingRun` *is* a table — a run is history, not config.)
 */
export const SAVED_SEARCHES_KEY = 'sourcing.savedSearches'

/**
 * The saved-search chip label, per `design/Sourcing.dc.html`: `backend · remote`,
 * `platform · SF`. Keywords first, then location, then the remote flag, joined
 * by a middle dot — the same separator the result cards use for their metadata
 * line, so the two read as one system.
 */
export function describeQuery(query: JobQuery): string {
  const parts = [
    query.keywords?.trim() ?? '',
    query.location?.trim() ?? '',
    query.remoteOnly ? 'remote' : '',
  ].filter((part) => part.length > 0)

  // An empty query is legal (the adapters return their full feed), and a chip
  // has to say something the user can recognise a week later.
  return parts.length > 0 ? parts.join(' · ') : 'any role'
}
