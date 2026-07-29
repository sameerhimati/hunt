import type { JobListing } from '@/lib/adapters/jobs/types'
import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { rateBatchMessage, rateBatchSystem } from '@/lib/llm/prompts/fit-batch'
import type { ResumeContent } from '@/lib/resume/schema'

import { FitUnavailableError, jsonFromResponse, parseFitRating, type FitRating } from './rate'

/**
 * Batch fit rating — a page of search results judged against one résumé.
 *
 * This module **wraps** `./rate`; it does not fork it. The tier vocabulary, the
 * citation-resolving parser and the `FitRating` shape all come from there, so a
 * posting cannot read Strong on the sourcing board and Possible on the
 * application page. One prompt kind (`rate`), one definition, one shape with
 * nowhere to put a number.
 *
 * Partial results are the design, not a failure mode. A listing the model skips
 * is simply absent from the map and its card renders unrated; a listing rated
 * with a tier outside the vocabulary, or with no reasons the user could check,
 * is dropped for that listing alone. One bad entry never blanks a page of good
 * ones, and nothing is ever coerced into a tier nobody chose.
 */

export type { FitRating, FitReason } from './rate'

/**
 * Listings per model call. Big enough that a page is one or two round trips,
 * small enough that the reply fits inside `maxTokens` — a truncated response
 * loses its whole chunk, and losing 18 ratings hurts less than losing 50.
 */
export const BATCH_SIZE = 18

/** Room for ~3 short cited reasons per listing, plus the JSON scaffolding. */
function maxTokensFor(count: number): number {
  return 400 + count * 260
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Pulls `{externalId, tier, reasons}` entries out of one response and merges the
 * good ones in. Anything unusable — a malformed entry, an id we never asked
 * about, an unparseable reply — leaves its listing unrated rather than throwing.
 */
function mergeRatings(
  into: Map<string, FitRating>,
  responseText: string,
  known: Set<string>,
  content: ResumeContent,
): void {
  let payload: unknown
  try {
    payload = jsonFromResponse(responseText)
  } catch {
    // This chunk goes unrated. The remaining chunks still get their turn.
    return
  }

  const ratings = (payload as { ratings?: unknown } | null)?.ratings
  if (!Array.isArray(ratings)) return

  for (const entry of ratings) {
    if (!entry || typeof entry !== 'object') continue
    const value = entry as Record<string, unknown>

    const externalId = typeof value.externalId === 'string' ? value.externalId.trim() : ''
    // An id we never sent is a listing that doesn't exist — there is no card for
    // it, and inventing one would be the model writing our search results.
    if (!known.has(externalId) || into.has(externalId)) continue

    try {
      into.set(externalId, parseFitRating(value, content))
    } catch {
      // Bad tier, or a verdict with no reasons: this listing stays unrated.
      continue
    }
  }
}

/**
 * Rates every listing against `content`. Keyed by `JobListing.externalId` — the
 * same identity search dedupes on, so a card can look up its own rating.
 * Listings the model didn't rate are absent from the map, never faked.
 *
 * `llm: null` means "no model" and `undefined` means "resolve the configured
 * one" — the same three-way convention `rateFit` uses. With no model at all the
 * caller gets a `FitUnavailableError` and the screen degrades to honest unrated
 * results rather than a stack trace.
 */
export async function rateFitBatch(
  listings: JobListing[],
  content: ResumeContent,
  llm?: LlmLike | null,
): Promise<Map<string, FitRating>> {
  const resolved = llm === null ? null : llm ? asResolvedLlm(llm) : await resolveLlm()
  if (!resolved) throw new FitUnavailableError()

  const rated = new Map<string, FitRating>()
  if (listings.length === 0) return rated

  const known = new Set(listings.map((listing) => listing.externalId))
  const batches = chunk(listings, BATCH_SIZE)
  const failures: unknown[] = []

  for (const batch of batches) {
    try {
      const response = await runPrompt({
        llm: resolved.provider,
        model: resolved.model,
        kind: 'rate',
        // The rules and the résumé are the cached prefix; only listings change.
        system: rateBatchSystem(content),
        messages: [{ role: 'user', content: rateBatchMessage(batch) }],
        maxTokens: maxTokensFor(batch.length),
      })

      mergeRatings(rated, response.text, known, content)
    } catch (error) {
      // A 429 on the last chunk must not throw away the ratings the earlier
      // ones already produced — partial results are this module's design, and
      // an unguarded await made that a lie. The listings in this chunk stay
      // unrated, which is a state their cards already know how to render.
      failures.push(error)
      const message = error instanceof Error ? error.message : String(error)
      // A silently halved rating pass is indistinguishable from a model that
      // just declined to rate half the page. Same rule as sourcing search.
      console.warn(`[fit] rating chunk of ${batch.length} failed: ${message}`)
    }
  }

  // Every chunk failing is not a partial answer — it is an error, and the
  // screen deserves the provider's reason rather than a board of unrated cards
  // that looks like the model had no opinion.
  if (failures.length === batches.length) throw failures[0]

  return rated
}
