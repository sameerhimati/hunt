import { describe, expect, it } from 'vitest'

// Phase 2 exit gate — the status machine and honest funnel math.
// RED until src/lib/pipeline/{status,stats}.ts exist.
import { APPLICATION_STATUSES, transitionApplication } from '@/lib/pipeline/status'
import { funnelStats } from '@/lib/pipeline/stats'
import { prisma } from '@/lib/db/client'

async function seedApplication(status = 'sourced') {
  const job = await prisma.job.create({
    data: { title: 'Backend Engineer', company: `Acme-${Math.random()}`, jdText: 'JD' },
  })
  return prisma.application.create({ data: { jobId: job.id, status } })
}

describe('status machine', () => {
  it('exposes the 8 pipeline statuses in board order', () => {
    expect(APPLICATION_STATUSES).toEqual([
      'sourced',
      'tailored',
      'applied',
      'outreach',
      'replied',
      'interview',
      'offer',
      'rejected',
    ])
  })

  it('stamps the milestone timestamps as a card advances', async () => {
    const app = await seedApplication()

    await transitionApplication(app.id, 'applied')
    let row = await prisma.application.findUniqueOrThrow({ where: { id: app.id } })
    expect(row.status).toBe('applied')
    expect(row.appliedAt).toBeInstanceOf(Date)

    await transitionApplication(app.id, 'replied')
    row = await prisma.application.findUniqueOrThrow({ where: { id: app.id } })
    expect(row.repliedAt).toBeInstanceOf(Date)
    // Advancing must never erase earlier milestones — provenance is the product.
    expect(row.appliedAt).toBeInstanceOf(Date)
  })

  it('rejects a status outside the vocabulary', async () => {
    const app = await seedApplication()
    await expect(transitionApplication(app.id, 'ghosted')).rejects.toThrow()
  })
})

describe('funnel stats (honest counts, no invented grades)', () => {
  it('counts by status and reports stage conversions', async () => {
    await seedApplication('applied')
    await seedApplication('applied')
    await seedApplication('replied')

    const stats = await funnelStats()
    expect(stats.byStatus.applied).toBeGreaterThanOrEqual(2)
    expect(stats.byStatus.replied).toBeGreaterThanOrEqual(1)
    // Conversion is a real ratio between real counts — never a synthetic score.
    expect(stats.conversions.length).toBeGreaterThan(0)
    for (const c of stats.conversions) {
      expect(c).toHaveProperty('from')
      expect(c).toHaveProperty('to')
      expect(c).toHaveProperty('count')
    }
  })
})
