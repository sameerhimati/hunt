/**
 * The queue read model — one answer to "who is waiting on me?"
 *
 * Three surfaces ask that question: the Outreach screen's left column, the
 * dashboard's *Follow-ups due today* panel, and the application detail page's
 * timeline. They must never disagree, so none of them counts rows itself —
 * they all read from here, and here reads the schedule from `./sequence`,
 * which owns the offset arithmetic.
 *
 * The split the screen draws (design/Outreach.dc.html):
 *
 *   Due today — the next pending step's computed date has arrived.
 *   Active    — the sequence is still running but its next step is in the
 *               future, *plus* sequences that stopped because the human
 *               answered (the mockup's "Priya Nair · Figma · replied ✓").
 *
 * A sequence that ran out of steps without a reply appears in neither: there is
 * nothing left to do and nothing left to wait for. Empty groups are dropped
 * rather than returned empty — the caller renders the empty state, so a group
 * heading never sits above nothing.
 *
 * Server-only: it reads Prisma and the encrypted settings. Client components
 * import their shapes from `./types`, which stays runtime-free on purpose.
 */

import type { Contact } from '@/generated/prisma/client'
import { createAdapter } from '@/lib/adapters/factory'
import { prisma } from '@/lib/db/client'

import { resolveFrom } from './send'
import { dueSteps, sequenceSteps, type SequenceKey } from './sequence'
import type {
  ContactSource,
  ContactView,
  DueStep,
  QueueEntry,
  QueueGroup,
  SequenceView,
} from './types'

/** Mirrors `PENDING_STATUSES` in `./sequence` — a step that still has a send ahead of it. */
const PENDING: readonly string[] = ['draft', 'scheduled']

/** A sequence is one contact's thread on one application. The same key `./sequence` walks. */
function keyOf(row: { applicationId: string; contactId: string | null }): string {
  return `${row.applicationId}::${row.contactId ?? ''}`
}

interface SequenceRow {
  applicationId: string
  contactId: string | null
  status: string
  sentAt: Date | null
  createdAt: Date
}

/** A queue entry before the Contact/Job join, carrying the value it sorts on. */
interface Pending {
  applicationId: string
  contactId: string | null
  state: QueueEntry['state']
  nextStep: QueueEntry['nextStep']
  sortAt: number
}

/**
 * The queue, grouped as the screen draws it.
 *
 * `now` is a parameter rather than a `new Date()` buried inside, so the
 * dashboard, the screen and the tests can all ask about the same instant.
 */
export async function outreachQueue(now: Date = new Date()): Promise<QueueGroup[]> {
  const rows: SequenceRow[] = await prisma.outreach.findMany({
    select: { applicationId: true, contactId: true, status: true, sentAt: true, createdAt: true },
  })
  if (rows.length === 0) return []

  const sequences = new Map<string, SequenceRow[]>()
  for (const row of rows) {
    const group = sequences.get(keyOf(row))
    if (group) group.push(row)
    else sequences.set(keyOf(row), [row])
  }

  // One query for the whole due set — `dueSteps` already guarantees at most one
  // step per sequence, which is exactly what a queue row shows.
  const due = await dueSteps(now)
  const dueByKey = new Map(due.map((step) => [keyOf(step), step]))

  const pending: Pending[] = []
  for (const [key, group] of sequences) {
    const { applicationId, contactId } = group[0]

    // A reply outranks everything else: the sequence halted, and the row now
    // exists to tell the user it ended well.
    const replied = group.find((row) => row.status === 'replied')
    if (replied) {
      pending.push({
        applicationId,
        contactId,
        state: 'replied',
        nextStep: null,
        sortAt: (replied.sentAt ?? replied.createdAt).getTime(),
      })
      continue
    }

    const dueStep = dueByKey.get(key)
    if (dueStep) {
      pending.push({
        applicationId,
        contactId,
        state: 'due',
        nextStep: {
          id: dueStep.id,
          sequenceStep: dueStep.sequenceStep,
          status: dueStep.status,
          dueAt: dueStep.dueAt,
        },
        sortAt: dueStep.dueAt.getTime(),
      })
      continue
    }

    if (!group.some((row) => PENDING.includes(row.status))) continue

    // Still running, just not yet. The date lives in the schedule, so ask the
    // module that computes it instead of re-deriving it here. One small query
    // per waiting sequence — a job hunt has tens of those, not thousands.
    const steps = await sequenceSteps({ applicationId, contactId })
    const next = steps.find((step) => PENDING.includes(step.status))
    if (!next) continue

    pending.push({
      applicationId,
      contactId,
      state: 'active',
      nextStep: {
        id: next.id,
        sequenceStep: next.sequenceStep,
        status: next.status,
        dueAt: next.dueAt,
      },
      sortAt: next.dueAt.getTime(),
    })
  }

  if (pending.length === 0) return []

  const context = await loadContext(pending.map((row) => row.applicationId))
  const toEntry = (row: Pending): QueueEntry => ({
    applicationId: row.applicationId,
    contactId: row.contactId,
    state: row.state,
    nextStep: row.nextStep,
    ...identify(context, row.applicationId, row.contactId),
  })

  // Soonest first in both groups; replied sequences sit under the still-running
  // ones, most recent answer first — good news reads newest-first.
  const byDate = (a: Pending, b: Pending) => a.sortAt - b.sortAt
  const dueEntries = pending.filter((row) => row.state === 'due').sort(byDate)
  const activeEntries = [
    ...pending.filter((row) => row.state === 'active').sort(byDate),
    ...pending.filter((row) => row.state === 'replied').sort((a, b) => b.sortAt - a.sortAt),
  ]

  const groups: QueueGroup[] = []
  if (dueEntries.length > 0) groups.push({ label: 'Due today', entries: dueEntries.map(toEntry) })
  if (activeEntries.length > 0) {
    groups.push({ label: 'Active', entries: activeEntries.map(toEntry) })
  }
  return groups
}

/** One dashboard row: the step that is due, plus who and where it is going. */
export interface FollowUpRow extends DueStep {
  company: string
  title: string
  contactName: string | null
}

/**
 * The dashboard's *Follow-ups due today* panel. Same source as the queue's
 * "Due today" group by construction — both walk `dueSteps` — so the count in
 * the panel header can never drift from the screen it links to.
 */
export async function followUpsDue(limit = 8): Promise<FollowUpRow[]> {
  const due = (await dueSteps(new Date())).slice(0, limit)
  if (due.length === 0) return []

  const context = await loadContext(due.map((step) => step.applicationId))
  return due.map((step) => {
    const { company, title } = identify(context, step.applicationId, step.contactId)
    return {
      ...step,
      company,
      title,
      contactName: step.contactId
        ? (context.get(step.applicationId)?.contacts.get(step.contactId) ?? null)
        : null,
    }
  })
}

/** Which sequence the composer should open. */
export interface SequenceSelector {
  applicationId?: string
  contactId?: string
}

/**
 * The composer's payload: the contact, the whole sequence, and whether hunt can
 * actually send. With no selector it opens whatever is most urgent — the first
 * step due, then the first sequence still running, then nothing at all.
 */
export async function sequenceView(selector: SequenceSelector = {}): Promise<SequenceView | null> {
  const key = await resolveKey(selector)
  if (!key) return null

  const [steps, contact, email] = await Promise.all([
    sequenceSteps(key),
    key.contactId ? prisma.contact.findUnique({ where: { id: key.contactId } }) : null,
    emailSetup(),
  ])

  return {
    applicationId: key.applicationId,
    contact: contact ? toContactView(contact) : null,
    steps,
    fromAddress: email.fromAddress,
    emailConfigured: email.configured,
  }
}

async function resolveKey({
  applicationId,
  contactId,
}: SequenceSelector): Promise<Required<SequenceKey> | null> {
  if (applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    })
    if (!application) return null
    if (contactId) return { applicationId, contactId }

    // No contact named: the sequence already dealt wins, otherwise the first
    // contact on the application — that is the composer opening a fresh draft.
    const dealt = await prisma.outreach.findFirst({
      where: { applicationId },
      orderBy: [{ sequenceStep: 'asc' }, { createdAt: 'asc' }],
      select: { contactId: true },
    })
    if (dealt) return { applicationId, contactId: dealt.contactId }

    const contact = await prisma.contact.findFirst({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return { applicationId, contactId: contact?.id ?? null }
  }

  if (contactId) {
    // A contact knows its application; one detached from it is still reachable
    // through the sequence it owns.
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { applicationId: true },
    })
    const owner =
      contact?.applicationId ??
      (
        await prisma.outreach.findFirst({
          where: { contactId },
          orderBy: { createdAt: 'asc' },
          select: { applicationId: true },
        })
      )?.applicationId
    return owner ? { applicationId: owner, contactId } : null
  }

  const groups = await outreachQueue()
  const first =
    groups.find((group) => group.label === 'Due today')?.entries[0] ??
    groups.find((group) => group.label === 'Active')?.entries[0]
  return first ? { applicationId: first.applicationId, contactId: first.contactId } : null
}

/**
 * The sending identity, and whether there is anything to send with.
 *
 * The address comes from `./send` rather than being derived again here: the
 * header the user reads before pressing Send has to be the address the send
 * path will actually use, and two copies of that rule would eventually drift.
 *
 * `emailConfigured` asks the factory rather than counting keys, because that is
 * the only place that knows what "configured" means — including in test mode,
 * where every email provider resolves to the fake and the send path stays real.
 */
async function emailSetup(): Promise<{ fromAddress: string | null; configured: boolean }> {
  const [fromAddress, resend, smtp] = await Promise.all([
    resolveFrom(),
    createAdapter('resend'),
    createAdapter('smtp'),
  ])

  return { fromAddress, configured: Boolean(resend ?? smtp) }
}

function toContactView(contact: Contact): ContactView {
  return {
    id: contact.id,
    name: contact.name,
    title: contact.title,
    company: contact.company,
    email: contact.email,
    linkedinUrl: contact.linkedinUrl,
    source: contact.source as ContactSource,
  }
}

interface ApplicationContext {
  company: string
  title: string
  contacts: Map<string, string>
}

/** Company, role and contact names for a batch of applications, in one query. */
async function loadContext(applicationIds: string[]): Promise<Map<string, ApplicationContext>> {
  const rows = await prisma.application.findMany({
    where: { id: { in: [...new Set(applicationIds)] } },
    select: {
      id: true,
      job: { select: { company: true, title: true } },
      contacts: { select: { id: true, name: true } },
    },
  })

  return new Map(
    rows.map((row) => [
      row.id,
      {
        company: row.job.company,
        title: row.job.title,
        contacts: new Map(row.contacts.map((contact) => [contact.id, contact.name])),
      },
    ]),
  )
}

function identify(
  context: Map<string, ApplicationContext>,
  applicationId: string,
  contactId: string | null,
): { contactName: string; company: string; title: string } {
  const application = context.get(applicationId)
  return {
    // A sequence can outlive its contact (deleting a Contact nulls the link),
    // and the row still has to name itself rather than render blank.
    contactName: (contactId ? application?.contacts.get(contactId) : undefined) ?? 'No contact',
    company: application?.company ?? '',
    title: application?.title ?? '',
  }
}
