import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { followUpsDue, outreachQueue, sequenceView } from '@/lib/outreach/queue'
import { createSequence, markReplied } from '@/lib/outreach/sequence'

/**
 * The queue is a whole-database read model — it deliberately has no "just my
 * rows" filter, because the screen it feeds has none either. So this file seeds
 * exactly one scenario, once, and asserts on the entire queue.
 *
 * The empty-database assertion therefore has to come first, before anything is
 * seeded. It stays honest about the contract the caller depends on: empty
 * groups are dropped, never returned as headings above nothing.
 */

interface Seeded {
  applicationId: string
  contactId: string
}

async function seed(company: string, title: string, name: string): Promise<Seeded> {
  const job = await prisma.job.create({ data: { title, company, jdText: 'JD' } })
  const application = await prisma.application.create({
    data: { jobId: job.id, status: 'outreach' },
  })
  const contact = await prisma.contact.create({
    data: {
      applicationId: application.id,
      name,
      title: 'Technical Recruiter',
      company,
      email: `${name.split(' ')[0]!.toLowerCase()}@${company.toLowerCase()}.com`,
      source: 'apollo',
    },
  })
  return { applicationId: application.id, contactId: contact.id }
}

describe('an empty queue', () => {
  it('returns no groups at all, so the caller can render one empty state', async () => {
    expect(await outreachQueue()).toEqual([])
    expect(await followUpsDue()).toEqual([])
    expect(await sequenceView()).toBeNull()
  })
})

describe('the queue', () => {
  let stripe: Seeded
  let linear: Seeded
  let figma: Seeded

  beforeAll(async () => {
    // Dana is due now (step 1 at day 0); Sam's intro is five days out; Priya
    // answered, which halts her sequence — the mockup's three rows exactly.
    stripe = await seed('Stripe', 'Senior Backend Engineer', 'Dana Reyes')
    await createSequence({
      ...stripe,
      steps: [
        { subject: 'Quick note on the SBE role', body: 'hi', dayOffset: 0 },
        { subject: 'Following up', body: 'bump', dayOffset: 4 },
      ],
    })

    linear = await seed('Linear', 'Product Engineer', 'Sam Ortiz')
    await createSequence({
      ...linear,
      steps: [{ subject: 'Intro', body: 'hi', dayOffset: 5 }],
    })

    figma = await seed('Figma', 'Design Engineer', 'Priya Nair')
    const [first] = await createSequence({
      ...figma,
      steps: [
        { subject: 'Intro', body: 'hi', dayOffset: 0 },
        { subject: 'Follow-up', body: 'bump', dayOffset: 4 },
      ],
    })
    await markReplied(first.id)
  })

  it('splits due from active, and files a replied sequence under Active', async () => {
    const groups = await outreachQueue()

    expect(groups.map((group) => group.label)).toEqual(['Due today', 'Active'])

    const [due, active] = groups
    expect(due.entries).toHaveLength(1)
    expect(due.entries[0]).toMatchObject({
      applicationId: stripe.applicationId,
      contactId: stripe.contactId,
      contactName: 'Dana Reyes',
      company: 'Stripe',
      title: 'Senior Backend Engineer',
      state: 'due',
    })
    expect(due.entries[0].nextStep?.sequenceStep).toBe(1)

    // Still-running sequences first, the answered one under them.
    expect(active.entries.map((entry) => [entry.contactName, entry.state])).toEqual([
      ['Sam Ortiz', 'active'],
      ['Priya Nair', 'replied'],
    ])
    // A replied sequence has no next step — there is nothing left to send.
    expect(active.entries[1].nextStep).toBeNull()
    expect(active.entries[0].nextStep?.sequenceStep).toBe(1)
  })

  it('leaves a sequence out of Due today until its date arrives', async () => {
    const inSixDays = new Date(Date.now() + 6 * 24 * 3600 * 1000)
    const groups = await outreachQueue(inSixDays)

    const due = groups.find((group) => group.label === 'Due today')
    expect(due?.entries.map((entry) => entry.company).sort()).toEqual(['Linear', 'Stripe'])
    // Priya still only appears as replied — a halted sequence never comes due.
    const active = groups.find((group) => group.label === 'Active')
    expect(active?.entries.map((entry) => entry.state)).toEqual(['replied'])
  })

  it('opens the composer on the due sequence when nothing is selected', async () => {
    const view = await sequenceView()

    expect(view?.applicationId).toBe(stripe.applicationId)
    expect(view?.contact?.name).toBe('Dana Reyes')
    expect(view?.contact?.source).toBe('apollo')
    // day 0 / day +4, the cumulative offsets the timeline prints.
    expect(view?.steps.map((step) => step.cumulativeOffset)).toEqual([0, 4])
    // No email provider is configured in the test DB, so Send degrades.
    expect(view?.emailConfigured).toBe(false)
    expect(view?.fromAddress).toBeNull()
  })

  it('opens the sequence asked for, by application or by contact', async () => {
    const byApplication = await sequenceView({ applicationId: figma.applicationId })
    expect(byApplication?.contact?.name).toBe('Priya Nair')
    expect(byApplication?.steps.map((step) => step.status)).toEqual(['replied', 'halted'])

    const byContact = await sequenceView({ contactId: linear.contactId })
    expect(byContact?.applicationId).toBe(linear.applicationId)
    expect(byContact?.steps).toHaveLength(1)

    expect(await sequenceView({ applicationId: 'no-such-application' })).toBeNull()
  })

  it('feeds the dashboard the same due steps, joined to company and human', async () => {
    const rows = await followUpsDue()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      applicationId: stripe.applicationId,
      company: 'Stripe',
      title: 'Senior Backend Engineer',
      contactName: 'Dana Reyes',
      sequenceStep: 1,
    })
    expect(rows[0].dueAt).toBeInstanceOf(Date)
  })

  it('caps the dashboard panel at its limit', async () => {
    expect(await followUpsDue(0)).toEqual([])
  })
})
