/**
 * The send path — and the honest fallback when hunt cannot send at all.
 *
 * Three rules shape this file:
 *
 * 1. **A step is claimed before the wire, not after.** Sending is irreversible:
 *    a duplicate lands in a recruiter's inbox and cannot be taken back. So the
 *    row is claimed with one conditional write *before* `email.send`, and a
 *    caller who loses that race is told so instead of sending. Client-side
 *    button state is a courtesy; this is the guarantee.
 * 2. **Nothing is stamped `sent` unless the mail actually left.** The row is
 *    stamped from the adapter's own `SendResult` (its `sentAt`, its
 *    `messageId`) after the send resolves. A "sent" row with no provider id is
 *    a lie the queue and the reply detector would both act on.
 * 3. **A missing key is a product state, not an exception page.** No email
 *    provider configured is the "Copy / mark as sent manually" branch SCREENS §9
 *    promises, so the error carries the provider's own `degradation` copy — the
 *    same sentence Settings shows — instead of a stack trace.
 */

import type { Outreach } from '@/generated/prisma/client'
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

/**
 * The provider took the message — or didn't — and we never found out which.
 * Neither Resend nor SMTP accepts an idempotency key, so hunt cannot ask again
 * without risking a second copy in the recipient's inbox. The row keeps its
 * claim (see `sendStep`) and this error says the true thing rather than the
 * comfortable one.
 */
export class SendUnconfirmedError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(
      'hunt could not confirm this send, so it may already have reached them. ' +
        'Check your sent mail: mark the step sent if it went out, or send it again if it did not. ' +
        `(${detail})`,
      { cause },
    )
    this.name = 'SendUnconfirmedError'
  }
}

export interface SendDeps {
  /** Injected by tests and by the e2e gate's capture-backed fake. */
  email?: EmailAdapter
  from?: string
  /**
   * The user looked at their sent mail, the message is not there, and they are
   * asking hunt to try again. The only way past a held claim — never a default,
   * never a retry hunt decides on by itself.
   */
  confirmResend?: boolean
}

/**
 * What happened, for a caller that has to say something true to the user.
 *
 * `unconfirmed` is the honest third answer: the step carries a claim from an
 * attempt whose outcome nobody ever learned. It is neither "sent" nor "not
 * sent", and pretending otherwise is what puts a second email in an inbox.
 */
export type SendOutcome = 'sent' | 'already-sent' | 'unconfirmed'

export interface SendStepResult {
  outcome: SendOutcome
  step: Outreach
}

/**
 * Statuses a step can still be sent from — the same pair `PENDING_STATUSES` in
 * `./sequence` walks. Everything else is history.
 */
const SENDABLE = ['draft', 'scheduled'] as const

function isSendable(status: string): boolean {
  return (SENDABLE as readonly string[]).includes(status)
}

/**
 * A step that was claimed for a send that never reported back: still pending,
 * but carrying a `sentAt`. Exported because the composer and the dashboard both
 * have to say "we don't know" instead of "not sent yet".
 */
export function isUnconfirmed(step: { status: string; sentAt: Date | null }): boolean {
  return step.sentAt !== null && isSendable(step.status)
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
 * Send one step, exactly once, and stamp what came back.
 *
 * **The claim.** Between reading the row and putting the message on the wire
 * there is a window in which a second request — a double-click, a retried form
 * POST, a second tab — would send the same email again. So one conditional
 * `updateMany` compare-and-swaps `sentAt` from what we read to a claim
 * timestamp, guarded on the status still being sendable. Exactly one caller can
 * win that write; the losers return `already-sent`/`unconfirmed` and never
 * touch the adapter. That is the whole guarantee, and it lives here rather than
 * in a disabled button because a disabled button is not a guarantee.
 *
 * **Why the claim is `sentAt` and not a new status.** `OUTREACH_STATUSES` is a
 * closed vocabulary the board, the queue and the timeline all read; a seventh
 * "sending" value would need a meaning in each of them. `sentAt` already means
 * "an attempt happened", so the claim reuses it: a row with `sentAt` set and a
 * still-pending status *is* the in-flight state, reconciled on read by
 * `isUnconfirmed`. No migration, no vocabulary change, one invariant.
 *
 * **What happens if the process dies mid-send.** The claim survives, and the
 * step reads as unconfirmed forever until a human resolves it. That is
 * deliberate, and it is not the same bug as a stuck lock: hunt genuinely does
 * not know whether that message left, and neither Resend nor SMTP takes an
 * idempotency key that would let it ask. An expiring lease would eventually
 * re-send — silently — into a recruiter's inbox, which is the exact failure
 * this function exists to prevent. So the escape is a person, not a timer:
 * "mark as sent" if it went out, `confirmResend` if it did not. Pre-flight
 * checks (no address, no provider, no From) all run *before* the claim, so the
 * common failures leave the row untouched and retryable.
 *
 * The application advances to `outreach` only when it is behind that column —
 * a row already at `replied` or `interview` must never be dragged backwards by
 * a follow-up going out.
 */
export async function sendStep(outreachId: string, deps: SendDeps = {}): Promise<SendStepResult> {
  const step = await prisma.outreach.findUniqueOrThrow({
    where: { id: outreachId },
    include: { contact: true },
  })

  if (!isSendable(step.status)) return { outcome: 'already-sent', step }
  if (isUnconfirmed(step) && !deps.confirmResend) return { outcome: 'unconfirmed', step }

  const to = step.contact?.email?.trim()
  if (!to) throw new NoContactEmailError()

  const email = deps.email ?? (await resolveEmail())
  if (!email) throw notConfigured('resend')

  const from = deps.from ?? (await resolveFrom())
  if (!from) throw notConfigured(email.id, 'no From address is set')

  // The claim. `sentAt: step.sentAt` is the compare half of the swap, so a
  // confirmed resend is as safe against a double-click as a first send is.
  const claimed = await prisma.outreach.updateMany({
    where: { id: step.id, status: { in: [...SENDABLE] }, sentAt: step.sentAt },
    data: { sentAt: new Date() },
  })
  if (claimed.count === 0) {
    const current = await prisma.outreach.findUniqueOrThrow({ where: { id: step.id } })
    return { outcome: isSendable(current.status) ? 'unconfirmed' : 'already-sent', step: current }
  }

  let result
  try {
    result = await email.send({ to, from, subject: step.subject, text: step.body })
  } catch (error) {
    // The claim stays. Releasing it here would be a guess that the message did
    // not leave, and that guess is wrong exactly when it is most expensive.
    throw new SendUnconfirmedError(error)
  }

  const row = await prisma.outreach.update({
    where: { id: step.id },
    data: {
      status: 'sent' satisfies OutreachStatus,
      sentAt: result.sentAt,
      threadRef: result.messageId,
    },
  })

  await advanceToOutreach(step.applicationId)
  return { outcome: 'sent', step: row }
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
