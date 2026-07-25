import { prisma } from '@/lib/db/client'

import type { ApplicationStatus } from './status'

/**
 * The board's read model. One query with the two joins the card needs — the
 * pinned résumé version is the provenance the whole product is built on, so it
 * travels with the card rather than being fetched on hover.
 */

export interface BoardCardRow {
  id: string
  status: ApplicationStatus
  company: string
  title: string
  location: string | null
  fitTier: string | null
  resumeLabel: string | null
  daysInStage: number
  updatedAt: Date
}

function daysSince(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
}

export async function boardCards(): Promise<BoardCardRow[]> {
  const rows = await prisma.application.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { job: true, resumeVersion: true },
  })

  return rows.map((row) => ({
    id: row.id,
    status: row.status as ApplicationStatus,
    company: row.job.company,
    title: row.job.title,
    location: row.job.location,
    fitTier: row.fitTier,
    resumeLabel: row.resumeVersion?.label ?? null,
    daysInStage: daysSince(row.updatedAt),
    updatedAt: row.updatedAt,
  }))
}

export async function applicationDetail(applicationId: string) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true, resumeVersion: { include: { resume: true } } },
  })
}
