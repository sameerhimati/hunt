import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { funnelStats } from '@/lib/pipeline/stats'
import { createApplication, transitionApplication } from '@/lib/pipeline/status'

/**
 * The funnel's arithmetic under exact, controlled counts.
 *
 * Its own file because these assertions are about ratios between whole-table
 * counts, which means the table has to hold only what the test put there —
 * `pipeline-status.test.ts` accumulates rows across its cases and can only
 * assert `toBeGreaterThanOrEqual`.
 */

let seq = 0

async function card(status: string) {
  seq += 1
  const job = await prisma.job.create({
    data: { title: 'Backend Engineer', company: `Funnel-${seq}`, jdText: 'JD' },
  })
  const application = await createApplication(job.id)
  await transitionApplication(application.id, status)
  return application
}

beforeEach(async () => {
  await prisma.application.deleteMany({})
  await prisma.job.deleteMany({})
})

describe('funnelStats conversions', () => {
  it('reports the ratio when the later stage really is a subset of the earlier one', async () => {
    const [first] = await Promise.all([card('applied'), card('applied')])
    await transitionApplication(first.id, 'replied')

    const stats = await funnelStats()
    const step = stats.conversions.find((entry) => entry.to === 'Replied')

    expect(step?.count).toBe(1)
    expect(step?.rate).toBe(0.5)
  })

  it('never prints a conversion rate above 100%', async () => {
    // A card can enter `replied` without ever passing through `applied` — the
    // board is a free kanban, and `outreach` is a legitimate route to a reply.
    await card('applied')
    await card('replied')
    await card('replied')

    const stats = await funnelStats()

    // The counts themselves are true and stay true.
    expect(stats.reached.find((stage) => stage.label === 'Applied')?.count).toBe(1)
    expect(stats.reached.find((stage) => stage.label === 'Replied')?.count).toBe(2)

    // 2/1 is not a conversion rate. It is the arithmetic of two sets that do
    // not nest, and the dashboard printed it as "200% → replied".
    expect(stats.conversions.find((entry) => entry.to === 'Replied')?.rate).toBeNull()

    for (const step of stats.conversions) {
      if (step.rate !== null) expect(step.rate).toBeLessThanOrEqual(1)
    }
  })

  it('holds the invariant at every stage, not just the one that was reported', async () => {
    await card('applied')
    await card('interview')
    await card('offer')
    await card('offer')

    const stats = await funnelStats()

    for (const step of stats.conversions) {
      if (step.rate !== null) {
        expect(step.rate).toBeGreaterThanOrEqual(0)
        expect(step.rate).toBeLessThanOrEqual(1)
      }
    }
  })

  it('still reports null rather than 0% when nothing reached the earlier stage', async () => {
    await card('sourced')

    const stats = await funnelStats()
    expect(stats.conversions.find((entry) => entry.to === 'Replied')?.rate).toBeNull()
  })
})
