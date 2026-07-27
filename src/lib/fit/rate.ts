import { isFitTier, type FitTier } from '@/lib/db/enums'
import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { rateFitMessage, rateFitSystem, type FitJob } from '@/lib/llm/prompts/fit'
import { resolvePath, type ResumeContent } from '@/lib/resume/schema'

/**
 * The fit engine — the one place in hunt that decides Strong / Possible / Reach.
 *
 * It exists as a shared seam on purpose. The application page rates one job and
 * the sourcing board rates fifty (`src/lib/fit/batch.ts` wraps this module), and
 * two implementations would quietly become two different definitions of
 * "Strong" — the same posting reading differently depending on which screen you
 * found it on. One prompt, one parser, one vocabulary.
 *
 * A `FitRating` is structurally incapable of carrying a number. There is no
 * score field to populate, no confidence, no percentage — the type is a tier and
 * a list of cited reasons, and the parser refuses anything else. That is the
 * honest-AI invariant enforced by construction rather than by prompt wording:
 * nobody can add "78% match" to a screen without first changing this file, and
 * a gate fails if they do.
 *
 * Nothing here touches the database. Callers decide whether a rating is worth
 * persisting to `Application.fitTier` / `fitReasons`.
 */

export type { FitJob } from '@/lib/llm/prompts/fit'
export type { FitTier } from '@/lib/db/enums'

export interface FitReason {
  /** One sentence about one requirement, written to the user. */
  text: string
  /** Résumé paths backing the claim — `experience[0].bullets[3]`. */
  citations: string[]
  /** True when the reason is about something the résumé does not evidence. */
  gap: boolean
  /**
   * One factual sentence, present only on a match hunt could not substantiate.
   * The UI must not render a flagged reason with the evidenced-match marker.
   */
  flag?: string
}

export interface FitRating {
  tier: FitTier
  reasons: FitReason[]
}

export interface RateFitInput {
  content: ResumeContent
  job: FitJob
  /** Injected by tests and gates; production resolves the configured model. */
  llm?: LlmLike | null
}

/** No model configured. The UI shows a DegradedBanner rather than a stack trace. */
export class FitUnavailableError extends Error {
  constructor() {
    super(
      'Fit rating needs a language model. Add an Anthropic (or OpenAI-compatible) ' +
        'key in Settings — everything else on this page works without one.',
    )
    this.name = 'FitUnavailableError'
  }
}

/** The model answered with something that isn't a rating. */
export class FitResponseError extends Error {
  constructor(detail: string) {
    super(`The model's fit rating was unusable: ${detail}`)
    this.name = 'FitResponseError'
  }
}

/** Pulls the first JSON object out of a reply that may be wrapped in prose. */
export function jsonFromResponse(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new FitResponseError('no JSON object in the response')
  }

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new FitResponseError('the JSON in the response did not parse')
  }
}

/**
 * Splits the model's citations into the ones that resolve into the user's
 * résumé and the ones that point nowhere.
 *
 * A path that points nowhere is not evidence, and rendering it as a citation
 * chip the user can click into nothing would be the exact false-provenance the
 * product refuses. But the unresolved paths are kept, not discarded: the fact
 * that the model cited `experience[3].bullets[2]` on a two-job résumé is the
 * user's only way to check what hunt could not.
 */
function partitionCitations(
  citations: unknown,
  content: ResumeContent,
): { resolved: string[]; unresolved: string[] } {
  const resolved: string[] = []
  const unresolved: string[] = []
  if (!Array.isArray(citations)) return { resolved, unresolved }

  for (const raw of citations) {
    if (typeof raw !== 'string') continue
    const path = raw.trim()
    if (!path) continue

    if (resolvePath(content, path) !== undefined) resolved.push(path)
    else unresolved.push(path)
  }

  return { resolved, unresolved }
}

/**
 * The flag sentence — same two cases, same words as the cover letter's
 * (`src/lib/tailor/cover-letter.ts`). "Cited nothing" and "cited a path you
 * don't have" are different facts about the same claim, and only the second one
 * is checkable if it names the path.
 */
function flagFor(unresolved: string[]): string {
  if (unresolved.length === 0) {
    return 'No source — nothing in your résumé backs this.'
  }

  const list = unresolved.slice(0, 3).join(', ')
  const rest = unresolved.length > 3 ? `, +${unresolved.length - 3} more` : ''
  return `No source — cited ${list}${rest}, which your résumé does not have.`
}

/**
 * Shared by the single and batch paths — same shape, same guarantees.
 *
 * An uncited reason is not silently downgraded to "uncited"; it is **flagged**,
 * because the screens render a match as a green `+` and a bare drop makes
 * "you built the Kafka pipeline at Stripe" — citing a bullet the résumé does
 * not have — look exactly like a traced claim about the user's own history.
 * Cited nothing, cited something that doesn't exist, and cited real text are
 * three different states and must stay visibly different.
 *
 * A gap is the one exception: it is a statement *about* an absence, so having
 * no citation is its correct state rather than a missing one. A gap whose
 * citations pointed nowhere is still flagged — that is the model erring, not
 * the résumé lacking.
 */
export function parseFitReasons(raw: unknown, content: ResumeContent): FitReason[] {
  if (!Array.isArray(raw)) return []

  const reasons: FitReason[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const value = entry as Record<string, unknown>
    const text = typeof value.text === 'string' ? value.text.trim() : ''
    if (!text) continue

    const { resolved, unresolved } = partitionCitations(value.citations, content)
    const gap = value.gap === true
    const unsubstantiated = resolved.length === 0 && (unresolved.length > 0 || !gap)

    reasons.push({
      text,
      citations: resolved,
      gap,
      ...(unsubstantiated ? { flag: flagFor(unresolved) } : {}),
    })
  }

  return reasons
}

/**
 * Validates one `{tier, reasons}` payload. Exported because the batch path
 * parses many of them out of a single response and must apply identical rules —
 * including the one that matters: a tier outside the vocabulary is an error, not
 * a value to coerce. "87%" arriving where a tier belongs means the model
 * ignored the contract, and quietly rounding it to "possible" would invent a
 * judgement nobody made.
 */
export function parseFitRating(raw: unknown, content: ResumeContent): FitRating {
  if (!raw || typeof raw !== 'object') {
    throw new FitResponseError('expected an object with a tier and reasons')
  }

  const value = raw as Record<string, unknown>
  const tier = typeof value.tier === 'string' ? value.tier.trim().toLowerCase() : ''
  if (!isFitTier(tier)) {
    throw new FitResponseError(`"${String(value.tier)}" is not one of strong, possible, reach`)
  }

  const reasons = parseFitReasons(value.reasons, content)
  if (reasons.length === 0) {
    // A tier with no reasons is a verdict the user can't check — the one thing
    // this product never ships.
    throw new FitResponseError('a tier arrived with no reasons')
  }

  return { tier, reasons }
}

export async function rateFit({ content, job, llm }: RateFitInput): Promise<FitRating> {
  const resolved = llm === null ? null : llm ? asResolvedLlm(llm) : await resolveLlm()
  if (!resolved) throw new FitUnavailableError()

  const response = await runPrompt({
    llm: resolved.provider,
    model: resolved.model,
    kind: 'rate',
    system: rateFitSystem(),
    messages: [{ role: 'user', content: rateFitMessage(content, job) }],
    maxTokens: 900,
  })

  return parseFitRating(jsonFromResponse(response.text), content)
}
