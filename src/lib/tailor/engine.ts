import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { tailorMessage, tailorSystem } from '@/lib/llm/prompts/tailor'
import type { ResumeContent } from '@/lib/resume/schema'

import { validateChanges } from './validator'
import type { FitJob, TailorRun } from './types'

/**
 * The tailor engine.
 *
 * `runTailor` asks the model (promptKind `tailor`) for proposed changes against
 * one résumé and one posting, then hands every proposal — without exception — to
 * `validateChanges`. It does not filter, rank or score. Whatever the model
 * returns, the same number of entries comes back out, some marked `refused`,
 * and the review screen shows all of them (TAILORING-DIFF §5).
 *
 * The prompt does not moralise; the guard is a validator, not a tone
 * (PHASE-PLAN §1). `src/lib/llm/prompts/tailor.ts` asks for sharp, specific
 * reframing of what the résumé already says and asks where each change came
 * from — and `./validator.ts` is what actually checks the answer.
 */

export interface TailorInput {
  content: ResumeContent
  job: FitJob
  /** Injected by tests and gates; production resolves the configured model. */
  llm?: LlmLike | null
  /** The version the run is based on — the parent of the saved child version. */
  baseVersionId?: string
}

/** No model configured. The UI shows a DegradedBanner rather than a stack trace. */
export class TailorUnavailableError extends Error {
  constructor() {
    super(
      'Tailoring needs a language model. Add an Anthropic (or OpenAI-compatible) ' +
        'key in Settings — the résumé editor and everything else still work without one.',
    )
    this.name = 'TailorUnavailableError'
  }
}

/** The model answered with something that isn't a set of changes. */
export class TailorResponseError extends Error {
  constructor(detail: string) {
    super(`The model's tailoring response was unusable: ${detail}`)
    this.name = 'TailorResponseError'
  }
}

/**
 * Pulls the first JSON object out of a reply that may be wrapped in prose —
 * same tolerance as the fit engine, because the same models wrap the same way.
 */
export function jsonFromResponse(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new TailorResponseError('no JSON object in the response')
  }

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new TailorResponseError('the JSON in the response did not parse')
  }
}

export async function runTailor({
  content,
  job,
  llm,
  baseVersionId,
}: TailorInput): Promise<TailorRun> {
  const resolved = llm === null ? null : llm ? asResolvedLlm(llm) : await resolveLlm()
  if (!resolved) throw new TailorUnavailableError()

  const response = await runPrompt({
    llm: resolved.provider,
    model: resolved.model,
    kind: 'tailor',
    system: tailorSystem(content, job),
    messages: [{ role: 'user', content: tailorMessage() }],
    maxTokens: 2400,
  })

  const payload = jsonFromResponse(response.text)
  const raw = (payload as { changes?: unknown }).changes
  if (!Array.isArray(raw)) {
    // A run with no changes is a legitimate outcome ("your résumé already covers
    // this role", TAILORING-DIFF §8) and arrives as an empty array. A missing
    // array is a different thing: the model ignored the contract, and inventing
    // "no changes" out of that would be a claim nobody made.
    throw new TailorResponseError('no changes array in the response')
  }

  // Ids are assigned here, before validation, so a proposal and its refusal
  // carry the same identity the DiffRow pins and the keyboard focus key off —
  // by position in the run, which nothing downstream reorders.
  const identified = raw.map((entry, index) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? { ...(entry as Record<string, unknown>), id: `change-${index + 1}` }
      : entry,
  )

  return {
    changes: validateChanges(identified, content),
    baseVersionId,
    job,
  }
}
