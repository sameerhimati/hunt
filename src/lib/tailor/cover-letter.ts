import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { coverLetterMessage, coverLetterSystem } from '@/lib/llm/prompts/cover-letter'
import { resolvePath, type ResumeContent } from '@/lib/resume/schema'

import type { FitJob } from './types'

/**
 * The cover letter — generative, and under the same guard (TAILORING-DIFF §6).
 *
 * The résumé half of a tailor run proposes changes and the validator refuses the
 * ones it cannot trace. A letter has no base to diff against, so nothing here is
 * "refused": the paragraph *is* the artifact, and deleting it would leave the
 * user with a hole in a letter instead of a fact about it. What happens instead
 * is that provenance is **attached** — each paragraph carries the résumé and
 * posting fields it draws on, resolved against the real document — and a
 * paragraph that rests on nothing traceable is **flagged where it sits, before
 * the letter is sent**. Never dropped, never blocking, no lecture: the flag
 * states that hunt found no source and stops talking (PHASE-PLAN §1).
 *
 * Two rules make that honest rather than decorative:
 *
 *  1. **A citation counts only if it resolves.** Same rule as the tailor
 *     validator, same `resolvePath`. An invented path is a chip that leads
 *     nowhere, which is worse than no chip at all — so unresolvable paths are
 *     stripped from the paragraph and named in the flag, where the user can
 *     check them.
 *  2. **The guard judges what hunt wrote, not what the user writes.** A
 *     paragraph the user typed or edited carries `origin: 'user'` and is never
 *     flagged. hunt does not author uncited claims; the user may write whatever
 *     they like on their own letter, and policing that would be exactly the
 *     moralising the product forbids.
 *
 * Persistence lives in `./cover-letter-store.ts` (a file under `./data` — see
 * the decision note there) and is re-exported here so callers keep one import.
 * That also means this module reaches the filesystem, so the tab component
 * imports **types only** from it and gets its values through the server actions;
 * a client component importing this file would drag `node:fs` into the browser
 * bundle.
 */

export type { FitJob }

/** One resolved source for a paragraph — a résumé path, or a field of the posting. */
export interface CoverLetterCitation {
  /** `experience[0].bullets[3]`, `basics.summary`, or `job.jdText`. */
  path: string
  /** Where it points. The UI labels résumé and posting sources differently. */
  source: 'resume' | 'job'
  /** The text at that path, for the hover affordance. Absent on a reloaded letter. */
  snippet?: string
}

export interface CoverLetterParagraph {
  /** Stable within a draft; the textarea and the citation row key off it. */
  id: string
  text: string
  /** Only citations that actually resolve. Unresolvable ones are named in `flag`. */
  citations: CoverLetterCitation[]
  /** `user` once the person edits or writes it — see rule 2 above. */
  origin: 'model' | 'user'
  /** One factual sentence. Present only on an unsourced model paragraph. */
  flag?: string
}

export interface CoverLetterDraft {
  applicationId: string
  paragraphs: CoverLetterParagraph[]
  /** ISO timestamp of the last save. Null on a draft that has never been saved. */
  savedAt?: string | null
}

export interface DraftCoverLetterInput {
  applicationId: string
  /** The résumé the letter draws on — normally the tailored child version. */
  content: ResumeContent
  job: FitJob
  /** Injected by tests and gates; production resolves the configured model. */
  llm?: LlmLike | null
}

/** No model configured. The tab shows a DegradedBanner rather than a stack trace. */
export class CoverLetterUnavailableError extends Error {
  constructor() {
    super(
      'Drafting a cover letter needs an LLM key. Add Anthropic or an OpenAI-compatible ' +
        'endpoint in Settings — the rest of the tailor run works without one.',
    )
    this.name = 'CoverLetterUnavailableError'
  }
}

/** The model answered with something that isn't a letter. */
export class CoverLetterResponseError extends Error {
  constructor(detail: string) {
    super(`The model's cover letter was unusable: ${detail}`)
    this.name = 'CoverLetterResponseError'
  }
}

/** The fields of the posting a paragraph may cite. Anything else under `job.` is not a source. */
const JOB_FIELDS = ['title', 'company', 'jdText'] as const

const JOB_PREFIX = 'job.'

/** Long enough to recognise the source, short enough to sit under a chip. */
const SNIPPET_LIMIT = 220

/** Pulls the first JSON object out of a reply that may be wrapped in prose. */
function jsonFromResponse(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new CoverLetterResponseError('no JSON object in the response')
  }

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new CoverLetterResponseError('the JSON in the response did not parse')
  }
}

/** Every string a cited node contains — citing `experience[0]` cites the whole job. */
function fieldText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(' · ')
  if (value && typeof value === 'object') {
    return Object.values(value).map(fieldText).filter(Boolean).join(' · ')
  }
  return ''
}

function snippetOf(value: unknown): string | undefined {
  const text = fieldText(value).replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > SNIPPET_LIMIT ? `${text.slice(0, SNIPPET_LIMIT - 1)}…` : text
}

/**
 * The provenance rule, in one function: a path is a source only if it resolves
 * to real text. `job.*` resolves against the posting, everything else against
 * the résumé — and a `job.` path outside the three fields the model was given is
 * as unresolvable as an invented résumé path.
 */
export function resolveCoverLetterCitation(
  path: string,
  content: ResumeContent,
  job: FitJob,
): CoverLetterCitation | null {
  const trimmed = path.trim()
  if (!trimmed) return null

  if (trimmed.startsWith(JOB_PREFIX)) {
    const field = trimmed.slice(JOB_PREFIX.length)
    if (!(JOB_FIELDS as readonly string[]).includes(field)) return null

    const snippet = snippetOf(job[field as (typeof JOB_FIELDS)[number]])
    return snippet ? { path: trimmed, source: 'job', snippet } : null
  }

  const resolved = resolvePath(content, trimmed)
  if (resolved === undefined || resolved === null) return null

  const snippet = snippetOf(resolved)
  return snippet ? { path: trimmed, source: 'resume', snippet } : null
}

/**
 * The flag sentence. Two cases, because "cited nothing" and "cited a field you
 * don't have" are different facts about the same paragraph, and the user can
 * only check the second one if it is named.
 */
function flagFor(unresolved: string[]): string {
  if (unresolved.length === 0) {
    return 'No source — nothing in your résumé or the posting backs this paragraph.'
  }

  const list = unresolved.slice(0, 3).join(', ')
  const rest = unresolved.length > 3 ? `, +${unresolved.length - 3} more` : ''
  return `No source — cited ${list}${rest}, which your résumé does not have.`
}

/** The flag a reloaded letter recomputes; the store has no résumé to re-resolve against. */
export const UNSOURCED_FLAG = flagFor([])

export interface CoverLetterContext {
  applicationId: string
  content: ResumeContent
  job: FitJob
}

/**
 * Turns a model response into a draft. Exported because this — not the network
 * call — is the part worth testing, and the fixture goes straight into it.
 *
 * Malformed entries are skipped rather than thrown on: one unreadable paragraph
 * should not cost the user the three good ones beside it. An empty letter *is*
 * an error, because there is then nothing to show and nothing to flag.
 */
export function parseCoverLetterDraft(raw: unknown, context: CoverLetterContext): CoverLetterDraft {
  if (!raw || typeof raw !== 'object') {
    throw new CoverLetterResponseError('expected an object with a paragraphs array')
  }

  const paragraphs = (raw as Record<string, unknown>).paragraphs
  if (!Array.isArray(paragraphs)) {
    throw new CoverLetterResponseError('no paragraphs array in the response')
  }

  const parsed: CoverLetterParagraph[] = []
  for (const entry of paragraphs) {
    if (!entry || typeof entry !== 'object') continue

    const value = entry as Record<string, unknown>
    const text = typeof value.text === 'string' ? value.text.trim() : ''
    if (!text) continue

    const cited = Array.isArray(value.citations)
      ? value.citations.filter((path): path is string => typeof path === 'string')
      : []

    const citations: CoverLetterCitation[] = []
    const unresolved: string[] = []
    for (const path of cited) {
      const citation = resolveCoverLetterCitation(path, context.content, context.job)
      if (citation) citations.push(citation)
      else if (path.trim()) unresolved.push(path.trim())
    }

    parsed.push({
      id: `p${parsed.length + 1}`,
      text,
      citations,
      origin: 'model',
      ...(citations.length === 0 ? { flag: flagFor(unresolved) } : {}),
    })
  }

  if (parsed.length === 0) {
    throw new CoverLetterResponseError('the response contained no paragraphs')
  }

  return { applicationId: context.applicationId, paragraphs: parsed, savedAt: null }
}

export async function draftCoverLetter({
  applicationId,
  content,
  job,
  llm,
}: DraftCoverLetterInput): Promise<CoverLetterDraft> {
  const resolved = llm === null ? null : llm ? asResolvedLlm(llm) : await resolveLlm()
  if (!resolved) throw new CoverLetterUnavailableError()

  const response = await runPrompt({
    llm: resolved.provider,
    model: resolved.model,
    kind: 'cover_letter',
    system: coverLetterSystem(content, job),
    messages: [{ role: 'user', content: coverLetterMessage() }],
    maxTokens: 1400,
  })

  return parseCoverLetterDraft(jsonFromResponse(response.text), { applicationId, content, job })
}

export { coverLetterPath, loadCoverLetter, saveCoverLetter } from './cover-letter-store'
