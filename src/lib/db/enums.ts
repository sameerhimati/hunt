/**
 * The string-enum vocabularies — one home for every `status`/`kind`/`source`
 * column in the schema.
 *
 * SQLite has no enum type, so those columns are plain Strings and the database
 * will happily store `"ghosted"`. The schema comments have pointed at this file
 * since Phase 0; it exists now because Wave 2 is the first time two areas share
 * a vocabulary (P4's sequence engine halts steps that P2's board already
 * renders). A single declaration is what stops a value from being legal in one
 * module and unknown in the next.
 *
 * Deliberately dependency-free — no Prisma, no `server-only`. Board cards,
 * status selects and timeline chips are client components, and importing
 * anything DB-shaped here would drag the native `better-sqlite3` addon into the
 * browser bundle and fail the build.
 */

/** `Application.status`, in board order. */
export const APPLICATION_STATUSES = [
  'sourced',
  'tailored',
  'applied',
  'outreach',
  'replied',
  'interview',
  'offer',
  'rejected',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value)
}

/**
 * `Outreach.status`. `halted` is the one that needs explaining: when a reply
 * lands, every later step of that sequence stops — but the rows stay, marked
 * halted, because "we planned three nudges and stopped after one because they
 * answered" is history worth keeping. Deleting them would make the sequence
 * look like it was never scheduled.
 */
export const OUTREACH_STATUSES = [
  'draft',
  'scheduled',
  'sent',
  'replied',
  'bounced',
  'halted',
] as const

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

export function isOutreachStatus(value: string): value is OutreachStatus {
  return (OUTREACH_STATUSES as readonly string[]).includes(value)
}

/**
 * `Application.fitTier` — qualitative, always. There is no fourth "score" tier
 * and there never will be; `src/lib/fit/rate.ts` is built on this list so the
 * type system itself refuses a percentage.
 */
export const FIT_TIERS = ['strong', 'possible', 'reach'] as const

export type FitTier = (typeof FIT_TIERS)[number]

export function isFitTier(value: string): value is FitTier {
  return (FIT_TIERS as readonly string[]).includes(value)
}

/** `Job.source` — how the posting arrived. */
export const JOB_SOURCES = ['paste', 'api', 'linkedin', 'manual'] as const

export type JobSource = (typeof JOB_SOURCES)[number]

/** `Contact.source` — where the human came from. */
export const CONTACT_SOURCES = ['apollo', 'linkedin', 'manual', 'brightdata'] as const

export type ContactSource = (typeof CONTACT_SOURCES)[number]

/**
 * `CheckResult.kind`. Five things we can actually measure — and no aggregate,
 * which is the honest-AI invariant expressed as a closed list rather than a
 * promise in a doc.
 */
export const CHECK_KINDS = [
  'parse_fidelity',
  'keyword_coverage',
  'format_lint',
  'ai_tell',
  'match_rating',
] as const

export type CheckKind = (typeof CHECK_KINDS)[number]

/** `CheckResult.verdict`. */
export const CHECK_VERDICTS = ['pass', 'warn', 'fail'] as const

export type CheckVerdict = (typeof CHECK_VERDICTS)[number]
