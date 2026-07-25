import { resolvePath, type ResumeContent } from '@/lib/resume/schema'

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
 * Every string a cited node contains. Citing a bullet gives that bullet; citing
 * `experience[0]` gives the whole job, which is coarse but legitimate evidence.
 */
function fieldText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(fieldText).join('\n')
  if (isRecord(value)) return Object.values(value).map(fieldText).join('\n')
  return ''
}

function readCitation(value: unknown): Citation | null {
  if (!isRecord(value)) return null

  const path = textOf(value.path)
  const snippet = textOf(value.snippet)
  if (!path || !snippet) return null

  return { path, snippet }
}

/** The whole judgement, in one place. */
function judge(citation: Citation | null, source: ResumeContent): Verdict {
  if (!citation) {
    return refused('No source in your résumé — the model cited nothing for this.')
  }

  const cited = resolvePath(source, citation.path)
  if (cited === undefined || cited === null) {
    return refused(`Cited ${citation.path}, which is not a field in your résumé.`)
  }

  const haystack = normalise(fieldText(cited))
  if (!haystack || !haystack.includes(normalise(citation.snippet))) {
    return refused(`The quoted text is not what ${citation.path} says.`)
  }

  return PROPOSED
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
      : judge(citation, source)

  return { id, kind, path, was, now, why, citation, ...verdict }
}
