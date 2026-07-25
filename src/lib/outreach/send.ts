/**
 * The send path — and the honest fallback when hunt cannot send at all.
 *
 * Two rules shape this file:
 *
 * 1. **Nothing is stamped unless the mail actually left.** The row is updated
 *    from the adapter's own `SendResult` (its `sentAt`, its `messageId`), after
 *    the send resolves. A "sent" row with no provider id is a lie the queue and
 *    the reply detector would both act on.
 * 2. **A missing key is a product state, not an exception page.** No email
 *    provider configured is the "Copy / mark as sent manually" branch SCREENS §9
 *    promises, so the error carries the provider's own `degradation` copy — the
 *    same sentence Settings shows — instead of a stack trace.
 */

import { createAdapter } from '@/lib/adapters/factory'
import type { EmailAdapter } from '@/lib/adapters/email/types'
import { prisma } from '@/lib/db/client'
import { APPLICATION_STATUSES } from '@/lib/db/enums'
import { transitionApplication } from '@/lib/pipeline/status'
import { getProvider, settingKey } from '@/lib/providers/registry'
import { readSetting } from '@/lib/settings/store'
import { isTestMode, TEST_FROM_ADDRESS } from '@/lib/testmode/env'

import type { OutreachStatus } from './types'

/**
 * The email providers, in the order the send path tries them. Resend first
 * because a hosted API key is the one that survives a laptop reboot; SMTP is
 * the bring-your-own-mailbox tier behind it.
 */
const EMAIL_PROVIDERS = ['resend', 'smtp'] as const

/**
 * The contact has no address. Not a crash and not a provider failure — the user
 * fixes it by typing an email or by marking the step sent by hand, and the
 * message says exactly that.
 */
export class NoContactEmailError extends Error {
  constructor() {
    super('no email address on this contact — add one or mark it sent manually')
    this.name = 'NoContactEmailError'
  }
}

/**
 * hunt has no way to send. Carries the provider name and its registry
 * `degradation` string so the UI can render the honest fallback verbatim.
 */
export class EmailNotConfiguredError extends Error {
  readonly provider: string
  readonly degradation: string

  constructor(provider: string, degradation: string, reason = 'no email provider is configured') {
    super(`${provider}: ${reason}. ${degradation}`)
    this.name = 'EmailNotConfiguredError'
    this.provider = provider
    this.degradation = degradation
  }
}

function notConfigured(providerId: string, reason?: string): EmailNotConfiguredError {
  const meta = getProvider(providerId) ?? getProvider('resend')
  return new EmailNotConfiguredError(meta?.name ?? 'Email', meta?.degradation ?? '', reason)
}

export interface SendDeps {
  /** Injected by tests and by the e2e gate's capture-backed fake. */
  email?: EmailAdapter
  from?: string
}

/**
 * Resolve the adapter from settings. In test mode both ids resolve to the
 * capture-backed `FakeEmailAdapter`, which is how the e2e gate observes a send
 * from another process — the production code path is unchanged.
 */
async function resolveEmail(): Promise<EmailAdapter | null> {
  for (const id of EMAIL_PROVIDERS) {
    const adapter = await createAdapter(id)
    if (adapter) return adapter as EmailAdapter
  }
  return null
}

/**
 * The sending identity: an explicit Resend sender, else the SMTP sender, else
 * the SMTP username — which for Gmail *is* the address.
 *
 * Exported because the composer header shows the same address it will send
 * from; two derivations of "who is this from" would eventually disagree, and
 * the one the user reads must be the one that goes out.
 *
 * In test mode the fake adapter stands in for a configured provider, so it
 * stands in for that provider's identity too — otherwise the gate's send path
 * dies on a missing From that no user of the fake ever set.
 */
export async function resolveFrom(): Promise<string | null> {
  const [resendFrom, smtpFrom, smtpUser] = await Promise.all([
    readSetting(settingKey('resend', 'fromAddress')),
    readSetting(settingKey('smtp', 'fromAddress')),
    readSetting(settingKey('smtp', 'user')),
  ])
  return resendFrom || smtpFrom || smtpUser || (isTestMode() ? TEST_FROM_ADDRESS : null)
}

/**
 * Send one step and stamp what came back.
 *
 * The application advances to `outreach` only when it is behind that column —
 * a row already at `replied` or `interview` must never be dragged backwards by
 * a follow-up going out.
 */
export async function sendStep(outreachId: string, deps: SendDeps = {}) {
  const step = await prisma.outreach.findUniqueOrThrow({
    where: { id: outreachId },
    include: { contact: true },
  })

  const to = step.contact?.email?.trim()
  if (!to) throw new NoContactEmailError()

  const email = deps.email ?? (await resolveEmail())
  if (!email) throw notConfigured('resend')

  const from = deps.from ?? (await resolveFrom())
  if (!from) throw notConfigured(email.id, 'no From address is set')

  const result = await email.send({ to, from, subject: step.subject, text: step.body })

  const row = await prisma.outreach.update({
    where: { id: step.id },
    data: {
      status: 'sent' satisfies OutreachStatus,
      sentAt: result.sentAt,
      threadRef: result.messageId,
    },
  })

  await advanceToOutreach(step.applicationId)
  return row
}

/**
 * The "Copy / mark as sent manually" half of the no-email-key degrade: the user
 * pasted the message into their own client, so the step is history now.
 * `threadRef` stays null — there is no provider id to record, and inventing one
 * would make the reply detector believe it can match a thread it never saw.
 */
export async function markSentManually(outreachId: string) {
  const step = await prisma.outreach.findUniqueOrThrow({ where: { id: outreachId } })

  const row = await prisma.outreach.update({
    where: { id: step.id },
    data: { status: 'sent' satisfies OutreachStatus, sentAt: new Date(), threadRef: null },
  })

  // A hand-sent message is still outreach that happened; the board should say so.
  await advanceToOutreach(step.applicationId)
  return row
}

/** The clipboard payload behind "Copy": headers a mail client can be filled from. */
export function messageText(
  step: { subject: string; body: string },
  contact?: { name?: string | null; email?: string | null } | null,
): string {
  const recipient = [contact?.name, contact?.email && `<${contact.email}>`].filter(Boolean).join(' ')

  const lines = recipient ? [`To: ${recipient}`] : []
  lines.push(`Subject: ${step.subject}`, '', step.body)
  return lines.join('\n')
}

async function advanceToOutreach(applicationId: string): Promise<void> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { status: true },
  })

  const order = APPLICATION_STATUSES as readonly string[]
  const current = order.indexOf(application.status)
  const target = order.indexOf('outreach')
  // An unknown status (-1) is left alone: this path is not the place to
  // normalise data it did not write.
  if (current < 0 || current >= target) return

  await transitionApplication(applicationId, 'outreach')
}
