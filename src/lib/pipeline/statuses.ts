/**
 * The status vocabulary — and nothing else.
 *
 * Split from `status.ts` because the board, the cards and the status control
 * are client components: importing the transition functions there would drag
 * Prisma (and `better-sqlite3`, a native addon) into the browser bundle, which
 * fails the build. Values live here; behaviour lives beside the database.
 */

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

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  sourced: 'Sourced',
  tailored: 'Tailored',
  applied: 'Applied',
  outreach: 'Outreach',
  replied: 'Replied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
}

/** Where a new card lands. */
export const DEFAULT_STATUS: ApplicationStatus = 'sourced'

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value)
}

export class UnknownStatusError extends Error {
  constructor(status: string) {
    super(`"${status}" is not a pipeline status. Legal values: ${APPLICATION_STATUSES.join(', ')}.`)
    this.name = 'UnknownStatusError'
  }
}
