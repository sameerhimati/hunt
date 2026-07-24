import { describe, expect, it } from 'vitest'

// Phase 4 exit gate — sequence scheduling and the halt-on-reply guarantee.
// RED until src/lib/outreach/sequence.ts exists.
import { createSequence, dueSteps, markReplied } from '@/lib/outreach/sequence'
import { prisma } from '@/lib/db/client'

async function seed() {
  const job = await prisma.job.create({
    data: { title: 'SBE', company: `Stripe-${Math.random()}`, jdText: 'JD' },
  })
  const application = await prisma.application.create({
    data: { jobId: job.id, status: 'outreach' },
  })
  const contact = await prisma.contact.create({
    data: { applicationId: application.id, name: 'Jordan Lee', email: 'jordan@example.com' },
  })
  return { application, contact }
}

describe('outreach sequences', () => {
  it('creates steps with day offsets and computes due dates from the previous step', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 'Quick note on the SBE role', body: 'hi', dayOffset: 0 },
        { subject: 'Following up', body: 'bump', dayOffset: 3 },
        { subject: 'Last nudge', body: 'closing the loop', dayOffset: 4 },
      ],
    })

    expect(steps).toHaveLength(3)
    expect(steps.map((s: { sequenceStep: number }) => s.sequenceStep)).toEqual([1, 2, 3])

    // Only step 1 is due on day zero; +3 and +4 are in the future.
    const due = await dueSteps(new Date())
    const mine = due.filter((s: { applicationId: string }) => s.applicationId === application.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].sequenceStep).toBe(1)
  })

  it('halts every remaining step the moment a reply lands', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 's1', body: 'b', dayOffset: 0 },
        { subject: 's2', body: 'b', dayOffset: 1 },
        { subject: 's3', body: 'b', dayOffset: 2 },
      ],
    })

    await markReplied(steps[0].id)

    // Even far in the future, nothing from this sequence is due again.
    const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    const due = await dueSteps(farFuture)
    expect(
      due.filter((s: { applicationId: string }) => s.applicationId === application.id),
    ).toHaveLength(0)

    // And the application itself flipped to replied.
    const app = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('replied')
    expect(app.repliedAt).toBeInstanceOf(Date)
  })
})
