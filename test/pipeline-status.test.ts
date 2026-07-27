import { describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { funnelStats, recentActivity } from '@/lib/pipeline/stats'
import { createApplication, transitionApplication } from '@/lib/pipeline/status'

async function seed(company: string) {
  const job = await prisma.job.create({
    data: { title: 'Backend Engineer', company, jdText: 'JD' },
  })
  return createApplication(job.id)
}

describe('createApplication', () => {
  it('deals one card per job, however many times the URL is pasted', async () => {
    const job = await prisma.job.create({
      data: { title: 'Backend Engineer', company: `Dedupe-${Math.random()}`, jdText: 'JD' },
    })

    const first = await createApplication(job.id)
    const second = await createApplication(job.id)

    expect(second.id).toBe(first.id)
    expect(await prisma.application.count({ where: { jobId: job.id } })).toBe(1)
  })
})

describe('transitionApplication', () => {
  it('never erases a milestone once it has happened', async () => {
    const application = await seed(`Acme-${Math.random()}`)

    await transitionApplication(application.id, 'applied')
    const applied = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })

    // Move backwards, the way a mis-drag would, then forwards again.
    await transitionApplication(application.id, 'sourced')
    await transitionApplication(application.id, 'applied')

    const row = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(row.appliedAt?.toISOString()).toBe(applied.appliedAt?.toISOString())
  })

  it('stamps offer and rejection on the same decision timestamp', async () => {
    const offer = await seed(`Offer-${Math.random()}`)
    await transitionApplication(offer.id, 'offer')
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: offer.id } })).decidedAt,
    ).toBeInstanceOf(Date)

    const rejected = await seed(`Rejected-${Math.random()}`)
    await transitionApplication(rejected.id, 'rejected')
    expect(
      (await prisma.application.findUniqueOrThrow({ where: { id: rejected.id } })).decidedAt,
    ).toBeInstanceOf(Date)
  })

  it('names the legal vocabulary when handed something else', async () => {
    const application = await seed(`Bad-${Math.random()}`)
    await expect(transitionApplication(application.id, 'ghosted')).rejects.toThrow(/not a pipeline status/)
  })
})

describe('funnelStats', () => {
  it('reads milestones off timestamps, so a rejection still counts as applied', async () => {
    const application = await seed(`Timeline-${Math.random()}`)
    await transitionApplication(application.id, 'applied')
    await transitionApplication(application.id, 'rejected')

    const stats = await funnelStats()
    const applied = stats.reached.find((stage) => stage.label === 'Applied')

    expect(applied?.count).toBeGreaterThanOrEqual(1)
    expect(stats.byStatus.rejected).toBeGreaterThanOrEqual(1)
  })

  it('reports a null conversion rather than 0% when a stage is empty', async () => {
    const stats = await funnelStats()
    const offerStep = stats.conversions.find((step) => step.to === 'Offer')

    expect(offerStep).toBeDefined()
    if (offerStep && offerStep.count === 0) {
      const interview = stats.reached.find((stage) => stage.label === 'Interview')
      if (interview?.count === 0) expect(offerStep.rate).toBeNull()
    }
  })
})

describe('recentActivity', () => {
  it('returns the most recently touched applications with their job', async () => {
    const application = await seed(`Recent-${Math.random()}`)
    await transitionApplication(application.id, 'tailored')

    const [first] = await recentActivity(1)
    expect(first.applicationId).toBe(application.id)
    expect(first.title).toBe('Backend Engineer')
  })
})
