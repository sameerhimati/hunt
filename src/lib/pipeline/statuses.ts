/**
 * The pipeline's view of the status vocabulary — and nothing else.
 *
 * Split from `status.ts` because the board, the cards and the status control
 * are client components: importing the transition functions there would drag
 * Prisma (and `better-sqlite3`, a native addon) into the browser bundle, which
 * fails the build. Values live here; behaviour lives beside the database.
 *
 * The list itself now comes from `src/lib/db/enums.ts`, where every string-enum
 * column is declared once; what stays here is the pipeline-specific dressing —
 * labels, the default column, and the error the transition path throws.
 */

import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/db/enums'

export { APPLICATION_STATUSES, isApplicationStatus } from '@/lib/db/enums'
export type { ApplicationStatus } from '@/lib/db/enums'

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

export class UnknownStatusError extends Error {
  constructor(status: string) {
    super(`"${status}" is not a pipeline status. Legal values: ${APPLICATION_STATUSES.join(', ')}.`)
    this.name = 'UnknownStatusError'
  }
}
