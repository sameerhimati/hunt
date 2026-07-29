import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { coverLetterMessage, coverLetterSystem } from '@/lib/llm/prompts/cover-letter'
import { modelRequired } from '@/lib/llm/unavailable'
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
 *  1. **A citation counts only if it resolves *and* the paragraph draws on it.**
 *     An invented path is a chip that leads nowhere, which is worse than no chip
 *     at all — so unresolvable paths are stripped and named in the flag. But a
 *     path that merely resolves is no better: resolving is a fact about the
 *     address, not about the claim, and a fabricated paragraph citing
 *     `basics.name` would otherwise render an affirmative chip reading "Draws on
 *     basics.name" — the user's own name displayed as evidence for something
 *     nothing supports, and no flag, because a flag only appears when *no*
 *     citation survives. So the field has to resolve to one piece of text, and
 *     that text has to share its substance with the paragraph
 *     (`draws`, below). Prose paraphrases legitimately, so this is a lexical
 *     overlap and not a quotation check — see the note in
 *     `src/lib/llm/prompts/cover-letter.ts` on why demanding verbatim snippets
 *     of a letter would be the wrong instrument.
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
      modelRequired('Drafting a cover letter', 'the rest of the tailor run works without one'),
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

/** The cited text as the chip shows it. The check reads the field in full. */
function snippetOf(field: string): string {
  const text = field.replace(/\s+/g, ' ').trim()
  return text.length > SNIPPET_LIMIT ? `${text.slice(0, SNIPPET_LIMIT - 1)}…` : text
}

/**
 * Words that are in every sentence in the language and are therefore evidence of
 * nothing. Kept deliberately short: an over-long list starts deleting the words
 * a claim is actually made of, and the failure this guard exists to prevent is
 * an unsupported paragraph passing, not a supported one being terse.
 */
const STOPWORDS = new Set([
  'a', 'about', 'across', 'after', 'against', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'been', 'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do',
  'does', 'during', 'each', 'every', 'for', 'from', 'had', 'has', 'have', 'her', 'here', 'his',
  'how', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'me', 'more', 'most', 'my', 'no', 'not',
  'of', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over', 'per', 'same', 'she', 'should',
  'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'up', 'via', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
])

/**
 * How many distinctive terms a paragraph and its cited field have to share.
 *
 * **Two**, when the field has that many. One is a coincidence — "Go" and
 * "engineer" turn up in every field of every backend résumé — and a chip reading
 * "Draws on experience[0].bullets[2]" should not rest on a coincidence. When the
 * cited field is shorter than that ("Go" at `skills[0].items[0]`, "Stripe" at
 * `job.company`) the bar is *every* term it has: a one-word field is either
 * named in the paragraph or it is not, and there is nothing in between. That is
 * also what kills `basics.name` under an invented claim — "Alex Chen" is two
 * terms, and a letter that carries no salutation names neither.
 */
const MIN_SHARED_TERMS = 2

/**
 * The distinctive terms of a piece of text. Case, punctuation and plurals are
 * noise — a letter that paraphrases "1.2M link attempts per day" as "1.2M
 * attempts a day" has drawn on that bullet — so they are folded away, and
 * numbers are kept whole because "$40M" and "99.95" are usually the whole claim.
 */
function terms(text: string): Set<string> {
  const found = new Set<string>()

  for (const raw of text.toLowerCase().split(/[^a-z0-9.]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, '')
    if (token.length < 2 || STOPWORDS.has(token)) continue
    found.add(token.length >= 4 && token.endsWith('s') && !token.endsWith('ss')
      ? token.slice(0, -1)
      : token)
  }

  return found
}

/**
 * Does this paragraph draw on this field? Overlap of distinctive terms, which is
 * what "supported by" can honestly mean for prose that is allowed to paraphrase.
 *
 * It is a floor, not a proof. It establishes that the paragraph and the cited
 * field are about the same things — enough to kill a citation picked to satisfy
 * the format, which is the failure mode that produces a false provenance chip.
 * It cannot establish that every clause around those shared terms is true; no
 * post-hoc check on generated prose can, and claiming otherwise would be the
 * same dishonesty one level up.
 */
function draws(field: string, paragraph: string): boolean {
  const wanted = terms(field)
  if (wanted.size === 0) return false

  const written = terms(paragraph)
  let shared = 0
  for (const term of wanted) {
    if (written.has(term)) shared += 1
  }

  return shared >= Math.min(MIN_SHARED_TERMS, wanted.size)
}

/**
 * The provenance rule, in one function: a path is a source only if it resolves
 * to one piece of real text *and* the paragraph draws on that text. `job.*`
 * resolves against the posting, everything else against the résumé — and a
 * `job.` path outside the three fields the model was given is as unresolvable as
 * an invented résumé path.
 *
 * A path into a whole record (`experience[0]`) is not a source either. It is an
 * address for a subtree, and a chip pointing at a subtree tells the user to go
 * and search rather than showing them the line the sentence rests on.
 */
export function resolveCoverLetterCitation(
  path: string,
  content: ResumeContent,
  job: FitJob,
  text: string,
): CoverLetterCitation | null {
  const target = citationTarget(path, content, job)
  if (!target || !draws(target.field, text)) return null

  return { path: target.path, source: target.source, snippet: snippetOf(target.field) }
}

/** The text one citation addresses, or null when it addresses nothing citable. */
function citationTarget(
  path: string,
  content: ResumeContent,
  job: FitJob,
): { path: string; source: 'resume' | 'job'; field: string } | null {
  const trimmed = path.trim()
  if (!trimmed) return null

  const isJob = trimmed.startsWith(JOB_PREFIX)
  const field = isJob ? trimmed.slice(JOB_PREFIX.length) : ''
  if (isJob && !(JOB_FIELDS as readonly string[]).includes(field)) return null

  const resolved = isJob
    ? job[field as (typeof JOB_FIELDS)[number]]
    : resolvePath(content, trimmed)

  // A string, and only a string: a record is an address for a subtree, not a
  // source, and it is what let a citation to a whole job entry look specific.
  if (typeof resolved !== 'string' || !resolved.trim()) return null

  return { path: trimmed, source: isJob ? 'job' : 'resume', field: resolved }
}

/**
 * The flag sentence. Three cases, because "cited nothing", "cited a field you
 * don't have" and "cited a field that says something else" are different facts
 * about the same paragraph, and the user can only check the last two if they are
 * named. Unresolved paths lead the sentence when there are both: an invented
 * path is the plainer error and the easier one to act on.
 */
function flagFor(unresolved: string[], unsupported: string[] = []): string {
  if (unresolved.length > 0) {
    return `No source — cited ${list(unresolved)}, which your résumé does not have.`
  }

  if (unsupported.length > 0) {
    return `No source — cited ${list(unsupported)}, which says nothing this paragraph rests on.`
  }

  return 'No source — nothing in your résumé or the posting backs this paragraph.'
}

function list(paths: string[]): string {
  const named = paths.slice(0, 3).join(', ')
  return paths.length > 3 ? `${named}, +${paths.length - 3} more` : named
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
    const unsupported: string[] = []
    for (const path of cited) {
      if (!path.trim()) continue

      const target = citationTarget(path, context.content, context.job)
      if (!target) unresolved.push(path.trim())
      else if (!draws(target.field, text)) unsupported.push(target.path)
      else citations.push({ path: target.path, source: target.source, snippet: snippetOf(target.field) })
    }

    parsed.push({
      id: `p${parsed.length + 1}`,
      text,
      citations,
      origin: 'model',
      ...(citations.length === 0 ? { flag: flagFor(unresolved, unsupported) } : {}),
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
