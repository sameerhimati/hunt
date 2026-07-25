import { prisma } from '@/lib/db/client'

import { APPLICATION_STATUSES, type ApplicationStatus } from './status'

/**
 * Funnel maths.
 *
 * Everything here is a count of rows that actually exist, and every ratio is
 * between two of those counts. There is no score, no grade, no "profile
 * strength" — a search with zero offers reads as "0 offers from 14 applications",
 * which is information, where a B- would be flattery. (DESIGN.md §7.)
 */

export interface StageConversion {
  from: string
  to: string
  /** How many applications reached `to`. */
  count: number
  /** count / (how many reached `from`). Null when nothing reached `from` yet. */
  rate: number | null
}

export interface FunnelStats {
  /** Every status, including the ones with zero cards. */
  byStatus: Record<ApplicationStatus, number>
  total: number
  /** Cumulative milestone counts — "reached applied", not "is in applied". */
  reached: { label: string; count: number }[]
  conversions: StageConversion[]
}

/**
 * Milestones are read off the timestamps, not the current status: a card that
 * is now "rejected" still applied and still got an interview, and a funnel that
 * forgot that would understate the search.
 */
const MILESTONES = [
  { label: 'In pipeline', where: {} },
  { label: 'Applied', where: { appliedAt: { not: null } } },
  { label: 'Replied', where: { repliedAt: { not: null } } },
  { label: 'Interview', where: { interviewAt: { not: null } } },
  { label: 'Offer', where: { offeredAt: { not: null } } },
] as const

export async function funnelStats(): Promise<FunnelStats> {
  const grouped = await prisma.application.groupBy({ by: ['status'], _count: { _all: true } })

  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, 0]),
  ) as Record<ApplicationStatus, number>

  for (const row of grouped) {
    if (row.status in byStatus) byStatus[row.status as ApplicationStatus] = row._count._all
  }

  const reached: { label: string; count: number }[] = []
  for (const milestone of MILESTONES) {
    reached.push({
      label: milestone.label,
      count: await prisma.application.count({ where: milestone.where }),
    })
  }

  const conversions: StageConversion[] = reached.slice(1).map((stage, index) => {
    const previous = reached[index]
    return {
      from: previous.label,
      to: stage.label,
      count: stage.count,
      rate: previous.count > 0 ? stage.count / previous.count : null,
    }
  })

  return {
    byStatus,
    total: reached[0].count,
    reached,
    conversions,
  }
}

export interface ActivityItem {
  applicationId: string
  company: string
  title: string
  status: string
  at: Date
}

/** The memory of a single-user tool: what moved, most recent first. */
export async function recentActivity(limit = 8): Promise<ActivityItem[]> {
  const rows = await prisma.application.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { job: true },
  })

  return rows.map((row) => ({
    applicationId: row.id,
    company: row.job.company,
    title: row.job.title,
    status: row.status,
    at: row.updatedAt,
  }))
}
