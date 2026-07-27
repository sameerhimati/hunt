/**
 * The pipeline status machine — the database half.
 *
 * Milestones are stamped once and never cleared. Moving a card backwards (a
 * mis-drag, a re-open) must not erase the fact that you applied on the 3rd —
 * provenance is the product, and a funnel built on erasable history would lie.
 *
 * The vocabulary itself lives in `./statuses` so client components can read it
 * without importing Prisma; it is re-exported here because this module is the
 * contract the gates and the rest of the app import.
 */

import { prisma } from '@/lib/db/client'

import {
  DEFAULT_STATUS,
  isApplicationStatus,
  UnknownStatusError,
  type ApplicationStatus,
} from './statuses'

export * from './statuses'

type MilestoneField = 'appliedAt' | 'repliedAt' | 'interviewAt' | 'decidedAt'

/** The statuses that mark a real event in the search, and the column they stamp. */
const MILESTONES: Partial<Record<ApplicationStatus, MilestoneField>> = {
  applied: 'appliedAt',
  replied: 'repliedAt',
  interview: 'interviewAt',
  offer: 'decidedAt',
  rejected: 'decidedAt',
}

export async function transitionApplication(applicationId: string, status: string) {
  if (!isApplicationStatus(status)) throw new UnknownStatusError(status)

  const current = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })

  const field = MILESTONES[status]
  // Only stamp a milestone the first time it happens: re-entering "replied"
  // after a second email shouldn't rewrite when the first reply arrived.
  const stamp = field && !current[field] ? { [field]: new Date() } : {}

  return prisma.application.update({
    where: { id: applicationId },
    data: { status, ...stamp },
  })
}

/**
 * The pipeline row for a job — one per job in v1, which makes this find-or-create
 * rather than create. Re-pasting a URL already on the board upserts the Job and
 * lands back here; without the lookup that second paste would deal a duplicate
 * card for the same posting. Enforced here rather than by a unique index because
 * Wave 2 sourcing may legitimately want a second run at an old job.
 */
export async function createApplication(jobId: string, status: ApplicationStatus = DEFAULT_STATUS) {
  const existing = await prisma.application.findFirst({
    where: { jobId },
    orderBy: { createdAt: 'asc' },
  })
  if (existing) return existing

  return prisma.application.create({ data: { jobId, status } })
}
