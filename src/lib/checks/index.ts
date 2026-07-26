import { CHECK_KINDS, type CheckKind } from '@/lib/db/enums'

import { runAiTell } from './ai-tell'
import { runFormatLint } from './format-lint'
import { runKeywordCoverage } from './keyword-coverage'
import { runMatchRating } from './match-rating'
import { runParseFidelity } from './parse-fidelity'
import type { CheckOutcome, CheckRunInput, CheckRunner } from './types'

/**
 * The checks registry — one slot per instrument, and the only place that knows
 * the full set.
 *
 * `CHECK_KINDS` comes from `src/lib/db/enums.ts` unchanged, so the closed list
 * of five is declared once for the schema, the panel and this fan-out. A sixth
 * "overall" kind cannot be added here without adding it there, where the
 * comment explains why it never will be: the absence of an aggregate is the
 * honest-AI invariant, and a closed list is how it survives contact with a
 * later feature request.
 *
 * Panel order is `CHECK_KINDS` order — parse fidelity first (does the machine
 * even read your document?), the JD-relative checks next, match rating last
 * because it is the qualitative one and belongs beside the others, not above
 * them as a verdict on the rest.
 */

export { CHECK_KINDS } from '@/lib/db/enums'
export type * from './types'

/** The named slot each Phase-3 check leaf fills. Order is not read from here — `CHECK_KINDS` is. */
const RUNNERS: Record<CheckKind, CheckRunner> = {
  parse_fidelity: runParseFidelity,
  keyword_coverage: runKeywordCoverage,
  format_lint: runFormatLint,
  ai_tell: runAiTell,
  match_rating: runMatchRating,
}

/**
 * Runs every check independently and returns one outcome per kind, always, in
 * panel order.
 *
 * Independence is the contract. A missing LLM key, an ATS parser that chokes on
 * a PDF, a JD that never arrived — each of those is one check's problem, and it
 * reports it in its own card (`verdict: 'warn'` plus the reason in `error`).
 * It never rejects the whole run and it never yields a short list, because a
 * card that quietly disappears reads as "nothing to report" when the truth is
 * "we didn't look".
 */
export async function runAllChecks(input: CheckRunInput): Promise<CheckOutcome[]> {
  const settled = await Promise.allSettled(CHECK_KINDS.map((kind) => RUNNERS[kind](input)))

  return settled.map((result, index) => {
    const kind = CHECK_KINDS[index]
    if (result.status === 'fulfilled') return result.value

    return {
      kind,
      verdict: 'warn',
      summary: 'Not measured',
      details: {},
      error: messageOf(result.reason),
    }
  })
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'This check failed to run.'
}
