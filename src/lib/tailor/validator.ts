import { resolvePath, type ResumeContent } from '@/lib/resume/schema'

import { canApply } from './apply'
import type { ChangeStatus, Citation, TailorChange, TailorChangeKind } from './types'

/**
 * The provenance instrument.
 *
 * For each proposal it answers exactly one question — *does this rest on
 * something the user actually wrote?* — by requiring both halves of the
 * citation to hold: the path must resolve into `source`, **and** the cited
 * snippet must really appear in the text at that path. Half a citation is not
 * evidence. A path that resolves to the wrong field is a plausible-looking chip
 * that leads nowhere, and a snippet the model composed to satisfy the format is
 * the fabrication wearing the costume of a source.
 *
 * What it is not is a morality gate (PHASE-PLAN §1). It has no opinion about
 * aggressive reframing, strong verbs or confident emphasis — those are the
 * product. It has an opinion about one thing: hunt does not author a claim it
 * cannot trace to the user's own document.
 *
 * It answers a second question too, and for the same reason: *can this change
 * actually land where it says it lands?* A proposal whose own `path` addresses
 * nothing is skipped by the applier, so it would render as an all-green
 * addition, be accepted, be counted — and be absent from the saved version. The
 * user would have reviewed a document that was never saved. That is the honesty
 * invariant read backwards, so it is refused here, where the user can see it.
 *
 * Three rules, all load-bearing (`src/lib/tailor/types.ts` explains why):
 *  - **the returned array has exactly as many entries as the input, in order.**
 *    Refusal is a `status` plus a `refusedReason`, never a deletion — a silently
 *    shortened list is a lie about what happened;
 *  - **it never throws.** The input comes straight off a model response, and a
 *    malformed entry is a refusal with a reason, not an exception that loses the
 *    good changes sitting next to it;
 *  - **it blocks nothing.** The caller applies the `proposed` subset and saves;
 *    refusals render as FabricationFlags and the user can add the claim
 *    themselves (TAILORING-DIFF §5).
 *
 * `refusedReason` is one short factual sentence. It never lectures, because
 * there is nothing to lecture about: the user did not write the claim, the model
 * did.
 */

const KINDS: readonly TailorChangeKind[] = ['edit', 'add', 'remove', 'reorder']

interface Verdict {
  status: ChangeStatus
  refusedReason?: string
}

const PROPOSED: Verdict = { status: 'proposed' }

function refused(reason: string): Verdict {
  return { status: 'refused', refusedReason: reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Whitespace, case and typography are noise here — a model that re-wraps a
 * bullet or straightens a quote has still copied the source. Anything past that
 * is different words, which is exactly what we are looking for.
 */
function normalise(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * How much of a field a quote has to be before it is evidence rather than a
 * coincidence. Two ways to clear it, because a short field and a short fragment
 * of a long one are different things:
 *
 *  - the change **rewrites the field it quotes**, end to end — "Go" cited at
 *    `skills[0].items[0]` by an edit of `skills[0].items[0]`. There is nothing
 *    thinner about that citation than a long one: the source is the whole field,
 *    the DiffRow shows it as `was` beside `now`, and the user is looking
 *    straight at the provenance. Refusing it would refuse the honest citation of
 *    a real one-word skill;
 *  - evidence borrowed from a **different** field has to carry a claim rather
 *    than name a thing: `MIN_SNIPPET_WORDS` words, and at least
 *    `MIN_SNIPPET_SHARE` of the text it is offered as evidence *for*. This is
 *    where "cites `experience[0].company`, snippet 'Ramp'" under an invented
 *    metric dies — a company name is true of the résumé and of nothing in it.
 *
 * **Four words**, because one is a name ("Ramp", "Kafka") and two or three are a
 * noun phrase ("the ledger service") — the cheapest things in the document to
 * quote, true of the résumé and of nothing in particular. Four is about where a
 * fragment starts carrying a subject and a predicate ("Reduced p99 from 210ms"),
 * which is the smallest thing that can support a claim.
 *
 * **A third**, because below that most of the proposed text is unquoted, and
 * "Traces to your résumé" over a chip is then a statement about a minority of
 * the sentence. It is deliberately not a half: tailoring legitimately compresses
 * two source facts into one line, and refusing that would cost the user a real
 * edit. Both numbers are floors on *evidence*, not judgements of the writing —
 * and neither can check that the unquoted remainder is true. Nothing post-hoc
 * can. What they buy is that a citation is a real, substantial span of one real
 * field, so the chip is pointing at something.
 */
const MIN_SNIPPET_WORDS = 4
const MIN_SNIPPET_SHARE = 1 / 3

function readCitation(value: unknown): Citation | null {
  if (!isRecord(value)) return null

  const path = textOf(value.path)
  const snippet = textOf(value.snippet)
  if (!path || !snippet) return null

  return { path, snippet }
}

/** The whole judgement, in one place. */
function judge(
  citation: Citation | null,
  source: ResumeContent,
  change: { path: string; now: string },
): Verdict {
  if (!citation) {
    return refused('No source in your résumé — the model cited nothing for this.')
  }

  const cited = resolvePath(source, citation.path)
  if (cited === undefined || cited === null) {
    return refused(`Cited ${citation.path}, which is not a field in your résumé.`)
  }

  // One field, not a subtree. Flattening a record made every string under it the
  // haystack, so citing `experience[0]` meant any word anywhere in the job
  // counted as a quote of it — and the chip then named a record the user would
  // have to search to check. "The snippet appears at that path" only means
  // something when the path is one piece of text.
  if (typeof cited !== 'string' || !cited.trim()) {
    return refused(`Cited ${citation.path}, which is not one field of your résumé.`)
  }

  const field = normalise(cited)
  const snippet = normalise(citation.snippet)
  if (!snippet || !field.includes(snippet)) {
    return refused(`The quoted text is not what ${citation.path} says.`)
  }

  if (!isEvidence(snippet, field, citation.path, change)) {
    return refused(`The quote from ${citation.path} is too little of it to carry this change.`)
  }

  return PROPOSED
}

/**
 * Does the quote say enough to be the source of `now`? See `MIN_SNIPPET_WORDS`
 * for why these two numbers. `now` is empty on a removal, where there is no
 * proposed text for the quote to be a share of — the word floor stands alone.
 */
function isEvidence(
  snippet: string,
  field: string,
  citedPath: string,
  change: { path: string; now: string },
): boolean {
  if (snippet === field && samePath(citedPath, change.path)) return true

  const words = snippet.split(' ').filter(Boolean).length
  if (words < MIN_SNIPPET_WORDS) return false

  const claim = normalise(change.now)
  return !claim || snippet.length >= claim.length * MIN_SNIPPET_SHARE
}

/** `experience[0].bullets[3]` and `experience.0.bullets.3` address one field. */
function samePath(a: string, b: string): boolean {
  const flatten = (path: string) => path.replace(/\[(\d+)\]/g, '.$1').replace(/\s+/g, '')
  return flatten(a) === flatten(b)
}

/**
 * The refusal for a change the applier could not land. Worded per kind because
 * "there is no such bullet" and "that is not a list" are different facts, and a
 * user who cannot tell which one it is cannot fix it.
 */
function unlandable(kind: TailorChangeKind, path: string): string {
  if (kind === 'reorder') return `Cannot reorder ${path} — your résumé has no list there.`
  if (kind === 'add') return `Cannot add at ${path} — your résumé has nowhere to put it.`
  if (kind === 'remove') return `Cannot remove ${path} — your résumé has no such field.`
  return `Cannot edit ${path} — your résumé has no text there.`
}

/**
 * Input is `unknown[]` because this is a boundary: entries arrive off a model
 * response with no ids and no status, and this is what turns them into
 * `TailorChange`es. Ids the engine already assigned survive; anything else gets
 * its position in the run, which is stable for as long as the run exists.
 */
export function validateChanges(
  changes: readonly unknown[],
  source: ResumeContent,
): TailorChange[] {
  return changes.map((entry, index) => normaliseChange(entry, index, source))
}

function normaliseChange(entry: unknown, index: number, source: ResumeContent): TailorChange {
  const position = `change-${index + 1}`

  if (!isRecord(entry)) {
    return {
      id: position,
      kind: 'edit',
      path: '',
      now: '',
      why: '',
      citation: null,
      ...refused('The model returned this change in a shape hunt could not read.'),
    }
  }

  const id = textOf(entry.id) || position
  const rawKind = textOf(entry.kind)
  const kind = (KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as TailorChangeKind)
    : 'edit'
  const path = textOf(entry.path)
  const now = typeof entry.now === 'string' ? entry.now : ''
  const why = textOf(entry.why)
  const citation = readCitation(entry.citation)

  // "Was" is read back out of the source rather than taken from the response:
  // it is a fact about the user's document, not a claim of the model's, and
  // reading it here means even a refused row can be shown in context.
  const existing = path ? resolvePath(source, path) : undefined
  const was = typeof existing === 'string' ? existing : undefined

  const verdict = !path
    ? refused('The model did not say where this change goes.')
    : !now && kind !== 'remove'
      ? refused('The model proposed no text for this change.')
      : !canApply(source, kind, path)
        ? refused(unlandable(kind, path))
        : judge(citation, source, { path, now })

  return { id, kind, path, was, now, why, citation, ...verdict }
}
