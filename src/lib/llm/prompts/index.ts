import type { LlmMessage, LlmProvider, LlmResponse, LlmSystemBlock } from '../types'

/**
 * Prompt registry — the `kind:` tagging convention every LLM call in hunt obeys.
 *
 * The first system block of every request is `kind:<promptKind>` and nothing
 * else. That one line buys three things:
 *   - the scripted fake (HUNT_TEST_MODE, src/lib/testmode/llm.ts) can dispatch a
 *     canned fixture per call site, so gates run with no key and no network;
 *   - dev logging and cost accounting can group spend by feature;
 *   - a stable, byte-identical prefix sits in front of the cached blocks.
 *
 * Per-feature prompt files land beside this one as their phase is built
 * (`fit.ts`, `tailor.ts`, `outreach.ts`, …) and each exports a builder that goes
 * through `runPrompt`. Adding a kind means adding it to PROMPT_KINDS here — the
 * vocabulary is deliberately closed so a typo can't silently skip the fake.
 */

export const PROMPT_KINDS = [
  /** Job URL → {title, company, location, companyBlurb} (Phase 2 ingest). */
  'extract',
  /** Résumé PDF text → ResumeContent (Phase 1 import). */
  'parse_resume',
  /** Résumé version + JD → proposed changes with citations (Phase 3). */
  'tailor',
  /** Cover letter under the same citation guard (Phase 3). */
  'cover_letter',
  /** Qualitative fit tier + cited reasons (Wave 2 fit engine, Phase 5 batch). */
  'rate',
  /** Outreach draft with citations (Phase 4). */
  'outreach',
] as const

export type PromptKind = (typeof PROMPT_KINDS)[number]

const KIND_PREFIX = 'kind:'

export function isPromptKind(value: string): value is PromptKind {
  return (PROMPT_KINDS as readonly string[]).includes(value)
}

/** The tag block. Always first, always alone — see the dispatch contract above. */
export function kindBlock(kind: PromptKind): LlmSystemBlock {
  return { text: `${KIND_PREFIX}${kind}` }
}

/** Reads the tag back off a request. Null when a caller bypassed `runPrompt`. */
export function promptKindOf(request: { system?: LlmSystemBlock[] }): PromptKind | null {
  const first = request.system?.[0]?.text.trim()
  if (!first?.startsWith(KIND_PREFIX)) return null

  const kind = first.slice(KIND_PREFIX.length).trim()
  return isPromptKind(kind) ? kind : null
}

export interface PromptRun {
  llm: LlmProvider
  model: string
  kind: PromptKind
  /**
   * Everything after the tag. Mark the frozen prefix (the base résumé, the JD)
   * with `cache: true` — it is resent on every call and caching it is the
   * single biggest cost lever we have.
   */
  system?: LlmSystemBlock[]
  messages: LlmMessage[]
  maxTokens: number
  temperature?: number
  stopSequences?: string[]
}

/**
 * The one way to call a model. Feature code never builds an LlmRequest by hand,
 * because a request without its kind block is invisible to the scripted fake.
 */
export function runPrompt({
  llm,
  model,
  kind,
  system,
  messages,
  maxTokens,
  temperature,
  stopSequences,
}: PromptRun): Promise<LlmResponse> {
  return llm.complete({
    model,
    maxTokens,
    system: [kindBlock(kind), ...(system ?? [])],
    messages,
    temperature,
    stopSequences,
  })
}
