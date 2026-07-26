'use server'

import { revalidatePath } from 'next/cache'

import { AdapterError } from '@/lib/adapters/types'
import { rateFitBatch } from '@/lib/fit/batch'
import { FitUnavailableError, type FitRating } from '@/lib/fit/rate'
import { getVersion, versionContent } from '@/lib/resume/store'
import { pullIntoPipeline } from '@/lib/sourcing/import'
import {
  deleteSavedSearch,
  listSavedSearches,
  runSavedSearch,
  saveSearch,
} from '@/lib/sourcing/saved'
import { searchJobs } from '@/lib/sourcing/search'
import type { JobListing, JobQuery, SavedSearch } from '@/lib/sourcing/types'

/**
 * The sourcing screen's server boundary. Thin on purpose: every function here
 * calls one library and shapes the answer for the client. Search, rating,
 * dedupe and persistence live in `src/lib/sourcing/*` and `src/lib/fit/*`, where
 * the unit gate can reach them without a browser.
 *
 * Two rules the whole file obeys:
 *   - **Nothing crosses the boundary that isn't plain data.** `rateFitBatch`
 *     returns a Map keyed by `externalId`; a Map serialises to `{}` through a
 *     server action, so it is flattened into an array here.
 *   - **Adapter failures are shown verbatim.** "402, over plan limit" is
 *     actionable; a stack trace is not. Same `describe()` as the pipeline.
 */

/** Adapter failures are shown verbatim — the user can act on "402, over plan limit". */
function describe(error: unknown): string {
  if (error instanceof AdapterError) return error.message
  return error instanceof Error ? error.message : 'Something failed. Try again.'
}

export interface SearchActionResult {
  listings?: JobListing[]
  error?: string
}

/** One rating, flattened out of the Map so it survives the action boundary. */
export interface RatedListing {
  externalId: string
  rating: FitRating
}

export interface RateActionResult {
  /** Only listings the model actually rated. Absent means unrated, never faked. */
  ratings: RatedListing[]
  /** Why nothing came back — no résumé, no model key. The cards stay honest and unrated. */
  degraded?: string
}

export interface PullActionResult {
  applicationId?: string
  error?: string
}

export interface SaveSearchActionResult {
  saved?: SavedSearch
  error?: string
}

/** Runs a query across every configured board. Results land unrated; `rateAction` fills them in. */
export async function searchAction(query: JobQuery): Promise<SearchActionResult> {
  try {
    return { listings: await searchJobs(query) }
  } catch (error) {
    return { error: describe(error) }
  }
}

/**
 * Rates a page of listings against the selected résumé version.
 *
 * A missing résumé or a missing model key is a *degraded* answer, not an error:
 * the board still shows every result, it just can't say how well they fit.
 */
export async function rateAction(
  listings: JobListing[],
  resumeVersionId: string | null,
): Promise<RateActionResult> {
  if (!resumeVersionId) {
    return {
      ratings: [],
      degraded:
        'Fit rating needs a résumé to rate against. Add one under Résumés and results will be rated.',
    }
  }

  try {
    const version = await getVersion(resumeVersionId)
    if (!version) {
      return { ratings: [], degraded: 'That résumé version no longer exists. Pick another one.' }
    }

    const rated = await rateFitBatch(listings, versionContent(version))
    return { ratings: [...rated].map(([externalId, rating]) => ({ externalId, rating })) }
  } catch (error) {
    if (error instanceof FitUnavailableError) return { ratings: [], degraded: error.message }
    return { ratings: [], degraded: describe(error) }
  }
}

/**
 * The one click that turns a result into a `sourced` application. The rating
 * travels with it, so the tier on the board is the tier on the card.
 */
export async function pullAction(
  listing: JobListing,
  rating?: FitRating,
): Promise<PullActionResult> {
  try {
    const { application } = await pullIntoPipeline(listing, rating)
    revalidatePath('/pipeline')
    revalidatePath('/')
    return { applicationId: application.id }
  } catch (error) {
    return { error: describe(error) }
  }
}

export async function saveSearchAction(query: JobQuery): Promise<SaveSearchActionResult> {
  try {
    const saved = await saveSearch(query)
    revalidatePath('/sourcing')
    return { saved }
  } catch (error) {
    return { error: describe(error) }
  }
}

/**
 * The chip row as storage has it right now.
 *
 * The page server-renders the chips for the first paint; this is how the client
 * reconciles them once it is running. A save is a write the browser may still
 * have in flight when the user reloads or navigates on — the render that
 * follows can read storage a millisecond too early and show a row that is
 * permanently one chip short. Re-reading after mount also picks up a save made
 * in another tab, which is the same list in the same SQLite file.
 */
export async function listSavedSearchesAction(): Promise<SavedSearch[]> {
  return listSavedSearches()
}

/** Re-runs a saved query. Records a `SourcingRun` — that's history, kept. */
export async function runSavedSearchAction(id: string): Promise<SearchActionResult> {
  try {
    const { listings } = await runSavedSearch(id)
    return { listings }
  } catch (error) {
    return { error: describe(error) }
  }
}

/** Drops a chip. Its past `SourcingRun` rows survive. */
export async function deleteSearchAction(id: string): Promise<{ error?: string }> {
  try {
    await deleteSavedSearch(id)
    revalidatePath('/sourcing')
    return {}
  } catch (error) {
    return { error: describe(error) }
  }
}
