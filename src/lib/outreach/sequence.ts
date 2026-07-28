/**
 * The sequence engine — when a follow-up is due, and when it stops being due.
 *
 * The one structural decision here: **due dates are computed, never stored.**
 * `Outreach` has no `dueAt` column, and it shouldn't have one. A stored date
 * would be a lie the moment step 1 goes out three days late, or the user edits
 * an offset — every later row would need rewriting, and any row missed by that
 * rewrite would silently schedule mail against a date that no longer exists.
 * Offsets are relative hops (`dayOffset` = days after the *previous* step), so
 * the schedule is derived by walking the sequence from an anchor:
 *
 *   cursor = (previous step's sentAt ?? cursor) + dayOffset days
 *
 * Re-basing on `sentAt` when it exists is what makes "+4 days" mean four days
 * after the intro actually left, not four days after we planned to send it.
 *
 * The second rule is the reason the queue can be trusted: **at most one step
 * per sequence is ever due** — the lowest-numbered one still waiting. You
 * cannot nudge someone before the intro went out, so a far-future query must
 * not hand back every unsent step at once.
 */

import type { Outreach } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import { transitionApplication } from '@/lib/pipeline/status'

import type { DueStep, OutreachStatus, OutreachStepView, SequenceStepInput } from './types'

/** Statuses that still have a send ahead of them. Everything else is history. */
const PENDING_STATUSES = ['draft', 'scheduled'] as const

const DAY_MS = 24 * 60 * 60 * 1000

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

/**
 * A sequence is one contact's thread on one application — the same pair the
 * halt rule walks. Two contacts at the same company run independent cadences.
 */
export interface SequenceKey {
  applicationId: string
  contactId?: string | null
}

function keyOf(row: { applicationId: string; contactId: string | null }): string {
  return `${row.applicationId}::${row.contactId ?? ''}`
}

/** Sequence order, with `createdAt` as the tie-break so it is total. */
function byStep(a: Outreach, b: Outreach): number {
  return a.sequenceStep - b.sequenceStep || a.createdAt.getTime() - b.createdAt.getTime()
}

/**
 * Walk one sequence and hand back each row with the date it comes due.
 * Rows must already be in step order.
 */
function schedule(rows: Outreach[]): { row: Outreach; dueAt: Date }[] {
  if (rows.length === 0) return []

  // The anchor is when the sequence was dealt, not when its first row happens
  // to sort first — a step added later must not move day zero.
  let cursor = new Date(Math.min(...rows.map((row) => row.createdAt.getTime())))
  let previous: Outreach | undefined

  return rows.map((row) => {
    cursor = addDays(previous?.sentAt ?? cursor, row.dayOffset)
    previous = row
    return { row, dueAt: cursor }
  })
}

async function loadSequence({ applicationId, contactId }: SequenceKey): Promise<Outreach[]> {
  const rows = await prisma.outreach.findMany({
    where: { applicationId, contactId: contactId ?? null },
  })
  return rows.sort(byStep)
}

/**
 * Deal a sequence: step 1 is the intro, 2..n the follow-ups, all `scheduled`
 * because a planned cadence is a commitment the queue can act on. `dayOffset`
 * is stored exactly as given — the arithmetic happens at read time.
 */
export async function createSequence({
  applicationId,
  contactId,
  steps,
}: SequenceKey & { steps: SequenceStepInput[] }): Promise<Outreach[]> {
  if (steps.length === 0) return []

  await prisma.outreach.createMany({
    data: steps.map((step, index) => ({
      applicationId,
      contactId: contactId ?? null,
      sequenceStep: index + 1,
      dayOffset: step.dayOffset,
      subject: step.subject,
      body: step.body,
      status: 'scheduled' satisfies OutreachStatus,
    })),
  })

  // createMany can't return rows on SQLite, so read them back in step order —
  // callers (the send path, the composer) need the ids.
  return loadSequence({ applicationId, contactId })
}

/**
 * Everything that should go out on or before `date`: one step per sequence,
 * the lowest-numbered one still pending, and only once its computed due date
 * has arrived. This is what the dashboard's follow-ups panel and the outreach
 * queue both read.
 */
export async function dueSteps(date: Date): Promise<DueStep[]> {
  const pending = await prisma.outreach.findMany({
    where: { status: { in: [...PENDING_STATUSES] } },
    select: { applicationId: true },
    distinct: ['applicationId'],
  })
  if (pending.length === 0) return []

  // Siblings come along because a pending step's due date depends on when the
  // steps before it were actually sent.
  const rows = await prisma.outreach.findMany({
    where: { applicationId: { in: pending.map((row) => row.applicationId) } },
  })

  const sequences = new Map<string, Outreach[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const group = sequences.get(key)
    if (group) group.push(row)
    else sequences.set(key, [row])
  }

  const due: DueStep[] = []
  for (const group of sequences.values()) {
    const scheduled = schedule(group.sort(byStep))
    const next = scheduled.find((entry) => isPending(entry.row.status))
    if (!next || next.dueAt.getTime() > date.getTime()) continue
    due.push(toDueStep(next.row, next.dueAt))
  }

  return due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

function isPending(status: string): boolean {
  return (PENDING_STATUSES as readonly string[]).includes(status)
}

function toDueStep(row: Outreach, dueAt: Date): DueStep {
  return {
    id: row.id,
    applicationId: row.applicationId,
    contactId: row.contactId,
    sequenceStep: row.sequenceStep,
    dayOffset: row.dayOffset,
    subject: row.subject,
    body: row.body,
    status: row.status as OutreachStatus,
    dueAt,
    sentAt: row.sentAt,
  }
}

/**
 * They answered. The step they answered becomes `replied`, every later step of
 * that sequence is `halted` — the rows survive, because "we planned three
 * nudges and stopped after one" is history worth keeping (see
 * `src/lib/db/enums.ts`) — and the application moves to `replied` through
 * `transitionApplication`, the one module that stamps milestones. Idempotent:
 * a second call finds nothing left pending and re-stamps nothing.
 */
export async function markReplied(outreachId: string) {
  const row = await prisma.outreach.findUniqueOrThrow({ where: { id: outreachId } })

  await prisma.outreach.update({ where: { id: row.id }, data: { status: 'replied' } })

  await prisma.outreach.updateMany({
    where: {
      applicationId: row.applicationId,
      contactId: row.contactId,
      sequenceStep: { gt: row.sequenceStep },
      status: { in: [...PENDING_STATUSES] },
    },
    data: { status: 'halted' },
  })

  return transitionApplication(row.applicationId, 'replied')
}

/**
 * The sequence as the timeline draws it. `dayOffset` is the relative hop the
 * user edits; `cumulativeOffset` is the sum from step 1 — the `day +9` the
 * mockup prints (design/Outreach.dc.html).
 */
export async function sequenceSteps(key: SequenceKey): Promise<OutreachStepView[]> {
  const rows = await loadSequence(key)

  let cumulative = 0
  return schedule(rows).map(({ row, dueAt }) => {
    cumulative += row.dayOffset
    return {
      id: row.id,
      sequenceStep: row.sequenceStep,
      subject: row.subject,
      body: row.body,
      dayOffset: row.dayOffset,
      cumulativeOffset: cumulative,
      status: row.status as OutreachStatus,
      sentAt: row.sentAt,
      dueAt,
    }
  })
}

/**
 * Edit one step. Every step is editable, sent ones included — the mockup says
 * so, and a sent row's copy is worth correcting for the next send even when
 * this one has left. Changing `dayOffset` shifts everything after it, because
 * the schedule is derived rather than stored.
 */
export async function updateStep(
  outreachId: string,
  patch: Partial<Pick<SequenceStepInput, 'subject' | 'body' | 'dayOffset'>>,
): Promise<Outreach> {
  return prisma.outreach.update({
    where: { id: outreachId },
    data: {
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.dayOffset !== undefined ? { dayOffset: patch.dayOffset } : {}),
    },
  })
}
