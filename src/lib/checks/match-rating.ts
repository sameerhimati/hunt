import type { FitTier } from '@/lib/db/enums'
import { FitUnavailableError, rateFit } from '@/lib/fit/rate'

import type { CheckOutcome, CheckRunInput, MatchRatingDetail } from './types'

/**
 * Match rating as a check card — the thinnest module in the phase, on purpose.
 *
 * It calls `rateFit` (the one definition of Strong / Possible / Reach in hunt)
 * and shapes the result into a `CheckOutcome`. Nothing is re-prompted or
 * re-parsed here; the sourcing board rates the same job through the same
 * engine, and a second vocabulary living in this file is exactly the drift the
 * fit foundation exists to prevent.
 *
 * A reach maps to `warn`, never `fail` — a reach is a legitimate application,
 * not a mistake. And there is no number anywhere in the payload: the tier and
 * its cited reasons are the whole reading.
 */

const TIER_WORD: Record<FitTier, string> = {
  strong: 'Strong',
  possible: 'Possible',
  reach: 'Reach',
}

const TIER_VERDICT: Record<FitTier, 'pass' | 'warn'> = {
  strong: 'pass',
  possible: 'warn',
  reach: 'warn',
}

export async function runMatchRating({ version, job, llm }: CheckRunInput): Promise<CheckOutcome> {
  if (!job) {
    return {
      kind: 'match_rating',
      verdict: 'warn',
      summary: 'Not measured — no job description',
      details: null,
      error:
        'Match rating compares this résumé against a posting. Open it from an application to rate the fit.',
    }
  }

  try {
    const rating = await rateFit({ content: version.content, job, llm })
    const count = rating.reasons.length
    const details: MatchRatingDetail = { tier: rating.tier, reasons: rating.reasons }

    return {
      kind: 'match_rating',
      verdict: TIER_VERDICT[rating.tier],
      summary: `${TIER_WORD[rating.tier]} — ${count} ${count === 1 ? 'reason' : 'reasons'}`,
      details,
    }
  } catch (err) {
    if (err instanceof FitUnavailableError) {
      return {
        kind: 'match_rating',
        verdict: 'warn',
        summary: 'Not measured — no model configured',
        details: null,
        error: err.message,
      }
    }

    return {
      kind: 'match_rating',
      verdict: 'warn',
      summary: 'Not measured — the rating failed',
      details: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
