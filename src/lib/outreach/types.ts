/**
 * The shapes every outreach module speaks in — and nothing else.
 *
 * Phase 4 lands as six parallel pieces (sequence engine, drafting prompts,
 * contacts UI, the Outreach screen, the send path, the detail-page timeline)
 * that all describe the same three nouns: a contact, a message, a step that is
 * due. Declared once here so the queue and the composer can't disagree about
 * what a step looks like.
 *
 * Deliberately runtime-free — no Prisma, no `server-only`, no imports beyond
 * the string-enum vocabularies. The queue, the timeline and the composer are
 * client components; anything DB-shaped in this file would drag the native
 * `better-sqlite3` addon into the browser bundle and fail the build. Same rule
 * `src/lib/pipeline/statuses.ts` follows, for the same reason.
 */

import type { ContactSource, OutreachStatus } from '@/lib/db/enums'

export type { ContactSource, OutreachStatus } from '@/lib/db/enums'

/**
 * A pointer into the source résumé — `experience[0].bullets[3]`, the same path
 * grammar tailoring cites. Drafts must cite, so the claim in a cold email can
 * always be traced back to a line the human actually wrote.
 */
export interface OutreachCitation {
  path: string
  snippet?: string
}

/** What the LLM hands back for one message, before it becomes a row. */
export interface DraftedOutreach {
  subject: string
  body: string
  citations: OutreachCitation[]
}

/**
 * One step as handed to `createSequence`. `dayOffset` is relative to the
 * *previous* step, not to day zero — see `FOLLOW_UP_OFFSETS`.
 */
export interface SequenceStepInput {
  subject: string
  body: string
  dayOffset: number
}

/** A step whose send date has arrived: what `dueSteps(date)` returns. */
export interface DueStep {
  id: string
  applicationId: string
  contactId: string | null
  sequenceStep: number
  dayOffset: number
  subject: string
  body: string
  status: OutreachStatus
  dueAt: Date
  sentAt: Date | null
}

/**
 * A step as the timeline draws it. `dayOffset` is the relative hop the user
 * edits; `cumulativeOffset` is the sum from step 1, which is what the mockup
 * prints as `day +9` (design/Outreach.dc.html).
 */
export interface OutreachStepView {
  id: string
  sequenceStep: number
  subject: string
  body: string
  dayOffset: number
  cumulativeOffset: number
  status: OutreachStatus
  sentAt: Date | null
  dueAt: Date
}

/** The human, as the ContactCard renders them. */
export interface ContactView {
  id: string
  name: string
  title: string | null
  company: string | null
  email: string | null
  linkedinUrl: string | null
  source: ContactSource
}

/**
 * One row of the queue column. `state` is the queue's own three-way split, not
 * a database status: a sequence is `due` when its next step's date has passed,
 * `active` while it's still scheduled, and `replied` once it halted because the
 * human answered.
 */
export interface QueueEntry {
  applicationId: string
  contactId: string | null
  contactName: string
  company: string
  title: string
  state: 'due' | 'active' | 'replied'
  nextStep: {
    id: string
    sequenceStep: number
    status: OutreachStatus
    dueAt: Date
  } | null
}

/** The queue's two headings, in the mockup's order. */
export interface QueueGroup {
  label: 'Due today' | 'Active'
  entries: QueueEntry[]
}

/**
 * Everything the composer needs for one application. `emailConfigured` is what
 * degrades Send into "Copy / mark as sent manually" — the composer itself works
 * with no email key at all.
 */
export interface SequenceView {
  applicationId: string
  contact: ContactView | null
  steps: OutreachStepView[]
  fromAddress: string | null
  emailConfigured: boolean
}

/**
 * The default cadence: send now, nudge four days later, last nudge five days
 * after that. Relative hops, so the timeline reads day 0 / +4 / +9 exactly as
 * the mockup does, and editing one offset shifts everything after it.
 */
export const FOLLOW_UP_OFFSETS = [0, 4, 5] as const
