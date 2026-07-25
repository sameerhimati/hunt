import type { ResumeContent } from '@/lib/resume/schema'

import type { LlmSystemBlock } from '../types'

/**
 * `kind:outreach` — the cold-outreach drafting prompt.
 *
 * Same shape as `fit.ts`: a frozen `cache: true` system block (identical bytes
 * on every draft, so it caches) plus a per-call message carrying the job and
 * the résumé JSON.
 *
 * The citation rule is the only hard rule, and it is a *provenance* rule, not a
 * morality one (PHASE-PLAN §1): the model may reframe, use strong verbs and
 * state real experience confidently — that is the product's job. What it may
 * not do is author a claim about the user that isn't in the user's own
 * document. `draft.ts` drops citations that don't resolve, so an invented path
 * costs the sentence its chip rather than the draft its life.
 *
 * The prompt never scolds the user, never refuses a reframing, and never
 * comments on the ethics of cold email. It writes the message.
 */

export const OUTREACH_SYSTEM = `You write one short cold outreach email, for the person whose résumé you are given, to a named human at a company they are applying to.

Return ONLY a JSON object, no prose and no code fences:
{ "subject": string, "body": string, "citations": [ { "path": string } ] }

Rules:
- Plain text only. No HTML, no markdown, no signature block, no placeholders
  like [Your Name] — the sender's name is already in the résumé.
- Short: a subject under 80 characters and a body of 4 to 6 sentences. It should
  read like one engineer writing to another, not like marketing.
- Open by naming the role and the specific thing about the work that connects to
  this person's experience. Close with one concrete, low-cost ask.
- No flattery ("I'm a huge fan of what you're building"), no hedging, no
  apologising for reaching out.
- Every concrete claim about the sender — a system they built, a number they
  moved, a tool they used — must come from the résumé and be cited.
- "citations" are paths into the résumé JSON — "experience[0].bullets[3]",
  "skills[1].items[0]", "basics.summary". Cite the fields the body rests on, and
  never cite a path you were not given.
- Write with the résumé's own strength. Sharper verbs and confident framing of
  what is genuinely there are wanted; new facts are not.`

/** The frozen prefix: identical for every draft, so it caches. */
export function outreachDraftSystem(): LlmSystemBlock[] {
  return [{ text: OUTREACH_SYSTEM, cache: true }]
}

export interface OutreachJob {
  title: string
  company: string
  /** Optional: the composer drafts from a manually added job with no JD text. */
  jdText?: string | null
}

export interface OutreachContact {
  name: string
  title?: string | null
  company?: string | null
}

export function outreachDraftMessage(
  content: ResumeContent,
  job: OutreachJob,
  contact: OutreachContact,
): string {
  const lines = [
    `Role: ${job.title} at ${job.company}`,
    `Recipient: ${contact.name}${contact.title ? `, ${contact.title}` : ''}${
      contact.company ? ` at ${contact.company}` : ''
    }`,
    '',
  ]

  const jdText = job.jdText?.trim()
  if (jdText) {
    lines.push('Posting:', '---', jdText, '---', '')
  } else {
    lines.push('No posting text is available — write from the role title alone.', '')
  }

  lines.push(
    'Résumé (JSON — citation paths are paths into this object):',
    '---',
    JSON.stringify(content),
    '---',
    '',
    'Return the JSON object.',
  )

  return lines.join('\n')
}
