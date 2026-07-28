import { describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import {
  createSequence,
  dueSteps,
  markReplied,
  sequenceSteps,
  updateStep,
} from '@/lib/outreach/sequence'

const DAY_MS = 24 * 60 * 60 * 1000

async function seed(name = 'Jordan Lee') {
  const job = await prisma.job.create({
    data: { title: 'Senior Backend Engineer', company: `Stripe-${Math.random()}`, jdText: 'JD' },
  })
  const application = await prisma.application.create({
    data: { jobId: job.id, status: 'outreach' },
  })
  const contact = await prisma.contact.create({
    data: { applicationId: application.id, name, email: `${name.split(' ')[0]}@example.com` },
  })
  return { application, contact }
}

/** What `dueSteps` returned for one application, ignoring every other test's rows. */
async function dueFor(applicationId: string, at: Date) {
  const due = await dueSteps(at)
  return due.filter((step) => step.applicationId === applicationId)
}

describe('createSequence', () => {
  it('numbers the steps and stores the offsets exactly as handed over', async () => {
    const { application, contact } = await seed()

    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 'Intro', body: 'hi', dayOffset: 0 },
        { subject: 'Follow-up', body: 'bump', dayOffset: 4 },
        { subject: 'Last nudge', body: 'closing', dayOffset: 5 },
      ],
    })

    expect(steps.map((s) => s.sequenceStep)).toEqual([1, 2, 3])
    expect(steps.map((s) => s.dayOffset)).toEqual([0, 4, 5])
    expect(steps.every((s) => s.status === 'scheduled')).toBe(true)
    expect(steps.every((s) => s.applicationId === application.id)).toBe(true)
  })
})

describe('dueSteps', () => {
  it('offers one step per sequence however far ahead you look', async () => {
    const { application, contact } = await seed()
    await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 's1', body: 'b', dayOffset: 0 },
        { subject: 's2', body: 'b', dayOffset: 3 },
        { subject: 's3', body: 'b', dayOffset: 4 },
      ],
    })

    // A year out, steps 2 and 3 are still not due: nothing follows up on an
    // intro that never left.
    const due = await dueFor(application.id, new Date(Date.now() + 365 * DAY_MS))
    expect(due).toHaveLength(1)
    expect(due[0].sequenceStep).toBe(1)
  })

  it('re-bases a follow-up on when the previous step actually went out', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 'Intro', body: 'hi', dayOffset: 0 },
        { subject: 'Follow-up', body: 'bump', dayOffset: 3 },
      ],
    })

    // The intro went out ten days late. Anchored on createdAt (today), step 2
    // would not be due for another three days; anchored on sentAt it was due a
    // week ago.
    const sentAt = new Date(Date.now() - 10 * DAY_MS)
    await prisma.outreach.update({ where: { id: steps[0].id }, data: { status: 'sent', sentAt } })

    const due = await dueFor(application.id, new Date())
    expect(due).toHaveLength(1)
    expect(due[0].sequenceStep).toBe(2)
    expect(due[0].dueAt.getTime()).toBe(sentAt.getTime() + 3 * DAY_MS)
  })

  it('holds a follow-up back until its own date arrives', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 'Intro', body: 'hi', dayOffset: 0 },
        { subject: 'Follow-up', body: 'bump', dayOffset: 3 },
      ],
    })

    const sentAt = new Date()
    await prisma.outreach.update({ where: { id: steps[0].id }, data: { status: 'sent', sentAt } })

    expect(await dueFor(application.id, new Date(Date.now() + 2 * DAY_MS))).toHaveLength(0)
    expect(await dueFor(application.id, new Date(Date.now() + 4 * DAY_MS))).toHaveLength(1)
  })

  it('runs one cadence per contact, not per application', async () => {
    const { application, contact } = await seed('Jordan Lee')
    const second = await prisma.contact.create({
      data: { applicationId: application.id, name: 'Dana Wu', email: 'dana@example.com' },
    })

    for (const contactId of [contact.id, second.id]) {
      await createSequence({
        applicationId: application.id,
        contactId,
        steps: [
          { subject: 'Intro', body: 'hi', dayOffset: 0 },
          { subject: 'Follow-up', body: 'bump', dayOffset: 3 },
        ],
      })
    }

    const due = await dueFor(application.id, new Date())
    expect(due).toHaveLength(2)
    expect(due.map((step) => step.contactId).sort()).toEqual([contact.id, second.id].sort())
    expect(due.every((step) => step.sequenceStep === 1)).toBe(true)
  })
})

describe('markReplied', () => {
  it('halts the rest of the sequence and keeps the rows as history', async () => {
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

    const rows = await prisma.outreach.findMany({
      where: { applicationId: application.id },
      orderBy: { sequenceStep: 'asc' },
    })
    expect(rows.map((r) => r.status)).toEqual(['replied', 'halted', 'halted'])
    expect(await dueFor(application.id, new Date(Date.now() + 30 * DAY_MS))).toHaveLength(0)

    const app = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('replied')
    expect(app.repliedAt).toBeInstanceOf(Date)
  })

  it('is idempotent — a second reply on the same step changes nothing', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 's1', body: 'b', dayOffset: 0 },
        { subject: 's2', body: 'b', dayOffset: 3 },
      ],
    })

    await markReplied(steps[0].id)
    const first = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })

    await markReplied(steps[0].id)
    const second = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })

    // The reply happened once; the timestamp must not drift on a re-run.
    expect(second.repliedAt?.toISOString()).toBe(first.repliedAt?.toISOString())
    const rows = await prisma.outreach.findMany({
      where: { applicationId: application.id },
      orderBy: { sequenceStep: 'asc' },
    })
    expect(rows.map((r) => r.status)).toEqual(['replied', 'halted'])
  })

  it('leaves a halted step halted rather than resurrecting it', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 's1', body: 'b', dayOffset: 0 },
        { subject: 's2', body: 'b', dayOffset: 1 },
        { subject: 's3', body: 'b', dayOffset: 1 },
      ],
    })

    await markReplied(steps[0].id)
    // A reply landing on an already-halted step (a late thread poll) marks that
    // one replied too, but must not un-halt anything or make the tail due.
    await markReplied(steps[1].id)

    const rows = await prisma.outreach.findMany({
      where: { applicationId: application.id },
      orderBy: { sequenceStep: 'asc' },
    })
    expect(rows.map((r) => r.status)).toEqual(['replied', 'replied', 'halted'])
    expect(await dueFor(application.id, new Date(Date.now() + 30 * DAY_MS))).toHaveLength(0)
  })
})

describe('sequenceSteps', () => {
  it('reports the cumulative day the timeline prints', async () => {
    const { application, contact } = await seed()
    await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 'Intro', body: 'hi', dayOffset: 0 },
        { subject: 'Follow-up', body: 'bump', dayOffset: 4 },
        { subject: 'Last nudge', body: 'closing', dayOffset: 5 },
      ],
    })

    const view = await sequenceSteps({ applicationId: application.id, contactId: contact.id })
    // day 0 / +4 / +9, exactly as design/Outreach.dc.html reads.
    expect(view.map((s) => s.cumulativeOffset)).toEqual([0, 4, 9])
    expect(view.map((s) => s.dayOffset)).toEqual([0, 4, 5])
    expect(view[2].dueAt.getTime() - view[0].dueAt.getTime()).toBe(9 * DAY_MS)
  })
})

describe('composer edits', () => {
  it('shifts every later step when an offset is edited', async () => {
    const { application, contact } = await seed()
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 'Intro', body: 'hi', dayOffset: 0 },
        { subject: 'Follow-up', body: 'bump', dayOffset: 4 },
        { subject: 'Last nudge', body: 'closing', dayOffset: 5 },
      ],
    })

    await updateStep(steps[1].id, { dayOffset: 2, subject: 'Following up' })

    const view = await sequenceSteps({ applicationId: application.id, contactId: contact.id })
    expect(view[1].subject).toBe('Following up')
    expect(view.map((s) => s.cumulativeOffset)).toEqual([0, 2, 7])
  })
})
