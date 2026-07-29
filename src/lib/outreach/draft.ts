import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import {
  outreachDraftMessage,
  outreachDraftSystem,
  type OutreachContact,
  type OutreachJob,
} from '@/lib/llm/prompts/outreach'
import { modelRequired } from '@/lib/llm/unavailable'
import { resolvePath, type ResumeContent } from '@/lib/resume/schema'

import { FOLLOW_UP_OFFSETS, type DraftedOutreach, type OutreachCitation, type SequenceStepInput } from './types'

/**
 * Drafting — the model writes step 1; this file decides what may be *claimed*.
 *
 * The provenance rule is the same one tailoring enforces: a citation survives
 * only if `resolvePath` finds it in the user's own résumé. A path the model
 * invented points at nothing, and rendering it as a hoverable chip would be
 * exactly the false provenance the product refuses. The sentence still ships —
 * the draft is the user's to edit and send, and silently deleting their message
 * because one pointer was wrong would be the worse failure. It just loses the
 * underline.
 *
 * Follow-ups are deterministic, not generated. Two extra model calls to say
 * "circling back" would cost tokens, add latency, and — because a follow-up has
 * no new evidence behind it — invite the model to assert something the résumé
 * never said. Steps 2 and 3 reference the role and nothing else.
 */

export type { OutreachContact, OutreachJob } from '@/lib/llm/prompts/outreach'

export interface DraftOutreachInput {
  content: ResumeContent
  job: OutreachJob
  contact: OutreachContact
  /** Injected by tests and gates; production resolves the configured model. */
  llm?: LlmLike | null
}

/** No model configured. The composer opens on `templateSequenceSteps` instead. */
export class OutreachUnavailableError extends Error {
  constructor() {
    super(
      modelRequired('Drafting outreach', 'you can still write and send the sequence yourself'),
    )
    this.name = 'OutreachUnavailableError'
  }
}

/** The model answered with something that isn't a message. */
export class OutreachResponseError extends Error {
  constructor(detail: string) {
    super(`The model's outreach draft was unusable: ${detail}`)
    this.name = 'OutreachResponseError'
  }
}

/** Pulls the first JSON object out of a reply that may be wrapped in prose. */
export function jsonFromResponse(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new OutreachResponseError('no JSON object in the response')
  }

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new OutreachResponseError('the JSON in the response did not parse')
  }
}

function citationPath(entry: unknown): string {
  if (typeof entry === 'string') return entry.trim()
  if (entry && typeof entry === 'object') {
    const path = (entry as Record<string, unknown>).path
    if (typeof path === 'string') return path.trim()
  }
  return ''
}

/**
 * Keeps only citations that resolve into this résumé, de-duplicated, carrying
 * the resolved text as the hover snippet when the target is a line of prose.
 */
export function resolvableCitations(raw: unknown, content: ResumeContent): OutreachCitation[] {
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const citations: OutreachCitation[] = []

  for (const entry of raw) {
    const path = citationPath(entry)
    if (!path || seen.has(path)) continue

    const value = resolvePath(content, path)
    if (value === undefined) continue

    seen.add(path)
    citations.push(typeof value === 'string' ? { path, snippet: value } : { path })
  }

  return citations
}

export function parseDraft(raw: unknown, content: ResumeContent): DraftedOutreach {
  if (!raw || typeof raw !== 'object') {
    throw new OutreachResponseError('expected an object with a subject and body')
  }

  const value = raw as Record<string, unknown>
  const subject = typeof value.subject === 'string' ? value.subject.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  if (!subject) throw new OutreachResponseError('the draft had no subject')
  if (!body) throw new OutreachResponseError('the draft had no body')

  return { subject, body, citations: resolvableCitations(value.citations, content) }
}

export async function draftOutreach({
  content,
  job,
  contact,
  llm,
}: DraftOutreachInput): Promise<DraftedOutreach> {
  const resolved = llm === null ? null : llm ? asResolvedLlm(llm) : await resolveLlm()
  if (!resolved) throw new OutreachUnavailableError()

  const response = await runPrompt({
    llm: resolved.provider,
    model: resolved.model,
    kind: 'outreach',
    system: outreachDraftSystem(),
    messages: [{ role: 'user', content: outreachDraftMessage(content, job, contact) }],
    maxTokens: 700,
  })

  return parseDraft(jsonFromResponse(response.text), content)
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim()
}

function greeting(contact: OutreachContact): string {
  const name = firstName(contact.name)
  return name ? `Hi ${name} — ` : ''
}

interface SequenceContext {
  job: OutreachJob
  contact: OutreachContact
}

/** Step 2: a nudge that adds no facts, only availability. */
function followUpTwo({ job, contact }: SequenceContext): SequenceStepInput {
  return {
    subject: `Re: ${job.title} — quick follow-up`,
    body:
      `${greeting(contact)}following up on my note about the ${job.title} role at ${job.company}. ` +
      'Happy to send anything that would be useful on my end. ' +
      'If this req belongs to someone else, a pointer in their direction is just as welcome.',
    dayOffset: FOLLOW_UP_OFFSETS[1],
  }
}

/** Step 3: the last one. Closes the loop and leaves the door open. */
function followUpThree({ job, contact }: SequenceContext): SequenceStepInput {
  return {
    subject: `${job.title} — closing the loop`,
    body:
      `${greeting(contact)}last note from me on the ${job.title} role at ${job.company}. ` +
      "I'll assume the timing isn't right and leave it here. " +
      "If it opens up again later, I'd still be glad to talk.",
    dayOffset: FOLLOW_UP_OFFSETS[2],
  }
}

/**
 * The drafted message plus its two deterministic follow-ups, ready for
 * `createSequence`. Offsets are relative hops — 0, +4, +5 — so the timeline
 * reads day 0 / +4 / +9 exactly as the mockup does.
 */
export function buildSequenceSteps(
  draft: DraftedOutreach,
  context: SequenceContext,
): SequenceStepInput[] {
  return [
    { subject: draft.subject, body: draft.body, dayOffset: FOLLOW_UP_OFFSETS[0] },
    followUpTwo(context),
    followUpThree(context),
  ]
}

/**
 * The keyless starter. With no LLM configured the composer opens on this rather
 * than an error dialog: a real sequence, with the role filled in and the one
 * sentence only the user can write left to them. Nothing here claims anything
 * about their experience, so nothing here needs a citation.
 */
export function templateSequenceSteps(context: SequenceContext): SequenceStepInput[] {
  const { job, contact } = context

  return [
    {
      subject: `${job.title} — quick note`,
      body:
        `${greeting(contact)}I'm applying for the ${job.title} role at ${job.company} and wanted to reach you directly.\n\n` +
        '[Two sentences on the work of yours that lines up with this role.]\n\n' +
        'Would you be open to a short call this week?',
      dayOffset: FOLLOW_UP_OFFSETS[0],
    },
    followUpTwo(context),
    followUpThree(context),
  ]
}
