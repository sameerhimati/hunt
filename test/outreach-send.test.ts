import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FakeEmailAdapter } from '@/lib/adapters/email/fake'
import type { EmailMessage, SendResult } from '@/lib/adapters/email/types'
import { prisma } from '@/lib/db/client'
import {
  EmailNotConfiguredError,
  markSentManually,
  messageText,
  NoContactEmailError,
  SendUnconfirmedError,
  sendStep,
} from '@/lib/outreach/send'
import { createSequence } from '@/lib/outreach/sequence'

/**
 * No `HUNT_TEST_MODE` here on purpose: this suite runs the *production*
 * resolution path against a data dir with no keys in it. That is what makes the
 * "no email provider" case real rather than simulated — the injected adapter is
 * the only thing standing in for a configured account.
 */

interface Seeded {
  applicationId: string
  stepId: string
}

let counter = 0

async function seed({
  email,
  status = 'applied',
}: { email?: string | null; status?: string } = {}): Promise<Seeded> {
  counter += 1
  const job = await prisma.job.create({
    data: { title: 'Senior Backend Engineer', company: `Stripe-${counter}`, jdText: 'JD' },
  })
  const application = await prisma.application.create({ data: { jobId: job.id, status } })
  const contact = await prisma.contact.create({
    data: {
      applicationId: application.id,
      name: 'Jordan Lee',
      title: 'Technical Recruiter',
      email: email ?? null,
      source: 'apollo',
    },
  })
  const [step] = await createSequence({
    applicationId: application.id,
    contactId: contact.id,
    steps: [{ subject: `Quick note ${counter}`, body: 'Hi Jordan —', dayOffset: 0 }],
  })

  return { applicationId: application.id, stepId: step!.id }
}

function tmpCaptureFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-send-')), 'outbox.jsonl')
}

/**
 * A provider that takes the message and then loses the answer — the failure the
 * claim exists for. `outbox` still records the send, because from the
 * recruiter's side it happened.
 */
class LosesTheAnswer extends FakeEmailAdapter {
  async send(message: EmailMessage): Promise<SendResult> {
    await super.send(message)
    throw new Error('socket hang up')
  }
}

describe('sending a step', () => {
  it('stamps the row from the send result and writes the message to the outbox', async () => {
    const { applicationId, stepId } = await seed({ email: 'jordan@example.com' })
    const captureFile = tmpCaptureFile()
    const email = new FakeEmailAdapter({ captureFile })

    await sendStep(stepId, { email, from: 'alex.chen@example.com' })

    const row = await prisma.outreach.findUniqueOrThrow({ where: { id: stepId } })
    expect(row.status).toBe('sent')
    expect(row.sentAt).toBeInstanceOf(Date)
    // The provider's own id, not one we invented — reply detection depends on it.
    expect(row.threadRef).toBe(email.outbox[0]!.messageId)

    const sent = JSON.parse(fs.readFileSync(captureFile, 'utf8').trim())
    expect(sent.to).toBe('jordan@example.com')
    expect(sent.from).toBe('alex.chen@example.com')
    expect(sent.subject).toBe(row.subject)
    expect(sent.text).toBe('Hi Jordan —')

    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })
    expect(application.status).toBe('outreach')
  })

  it('never drags an application backwards from a later column', async () => {
    const seeded = await seed({ email: 'jordan@example.com', status: 'interview' })

    await sendStep(seeded.stepId, {
      email: new FakeEmailAdapter(),
      from: 'alex.chen@example.com',
    })

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: seeded.applicationId },
    })
    expect(application.status).toBe('interview')
  })

  it('refuses a contact with no address, and stamps nothing', async () => {
    const { stepId } = await seed({ email: null })
    const email = new FakeEmailAdapter()

    await expect(sendStep(stepId, { email, from: 'alex.chen@example.com' })).rejects.toBeInstanceOf(
      NoContactEmailError,
    )
    await expect(sendStep(stepId, { email, from: 'alex.chen@example.com' })).rejects.toThrow(
      /mark it sent manually/,
    )

    const row = await prisma.outreach.findUniqueOrThrow({ where: { id: stepId } })
    expect(row.status).toBe('scheduled')
    expect(row.sentAt).toBeNull()
    expect(email.outbox).toHaveLength(0)
  })

  it('degrades with the provider name and its own copy when no email key exists', async () => {
    const { applicationId, stepId } = await seed({ email: 'jordan@example.com' })

    const error = await sendStep(stepId).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(EmailNotConfiguredError)
    const failure = error as EmailNotConfiguredError
    expect(failure.provider).toBe('Resend')
    // The fallback the UI shows is the registry's degradation string, verbatim.
    expect(failure.degradation).toContain('copy it into your own mail client')
    expect(failure.message).toContain('Resend')
    expect(failure.message).toContain(failure.degradation)

    const row = await prisma.outreach.findUniqueOrThrow({ where: { id: stepId } })
    expect(row.status).toBe('scheduled')
    expect(row.sentAt).toBeNull()
    expect(row.threadRef).toBeNull()
    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })
    expect(application.status).toBe('applied')
  })
})

describe('sending a step exactly once', () => {
  it('refuses to put the same step on the wire twice', async () => {
    const { stepId } = await seed({ email: 'jordan@example.com' })
    const email = new FakeEmailAdapter()

    const first = await sendStep(stepId, { email, from: 'alex.chen@example.com' })
    const second = await sendStep(stepId, { email, from: 'alex.chen@example.com' })

    expect(first.outcome).toBe('sent')
    expect(second.outcome).toBe('already-sent')
    expect(email.outbox).toHaveLength(1)
  })

  it('sends once when two clicks race the same step', async () => {
    const { stepId } = await seed({ email: 'jordan@example.com' })
    const email = new FakeEmailAdapter()

    const outcomes = await Promise.all([
      sendStep(stepId, { email, from: 'alex.chen@example.com' }),
      sendStep(stepId, { email, from: 'alex.chen@example.com' }),
    ])

    // The row is claimed before the network call, so only one caller can reach it.
    expect(email.outbox).toHaveLength(1)
    expect(outcomes.filter((result) => result.outcome === 'sent')).toHaveLength(1)
  })

  it('holds the claim and says the outcome is unknown when the provider drops the answer', async () => {
    const { stepId } = await seed({ email: 'jordan@example.com' })

    await expect(
      sendStep(stepId, { email: new LosesTheAnswer(), from: 'alex.chen@example.com' }),
    ).rejects.toBeInstanceOf(SendUnconfirmedError)

    const row = await prisma.outreach.findUniqueOrThrow({ where: { id: stepId } })
    expect(row.status).toBe('scheduled')
    // Claimed, not stamped: hunt does not know whether that message left.
    expect(row.sentAt).toBeInstanceOf(Date)
    expect(row.threadRef).toBeNull()

    // And the obvious retry does not quietly mail the recruiter a second time.
    const retry = new FakeEmailAdapter()
    const result = await sendStep(stepId, { email: retry, from: 'alex.chen@example.com' })
    expect(result.outcome).toBe('unconfirmed')
    expect(retry.outbox).toHaveLength(0)
  })

  it('sends again only when the user says the first attempt never landed', async () => {
    const { stepId } = await seed({ email: 'jordan@example.com' })

    await expect(
      sendStep(stepId, { email: new LosesTheAnswer(), from: 'alex.chen@example.com' }),
    ).rejects.toBeInstanceOf(SendUnconfirmedError)

    const retry = new FakeEmailAdapter()
    const result = await sendStep(stepId, {
      email: retry,
      from: 'alex.chen@example.com',
      confirmResend: true,
    })

    expect(result.outcome).toBe('sent')
    expect(retry.outbox).toHaveLength(1)
    const row = await prisma.outreach.findUniqueOrThrow({ where: { id: stepId } })
    expect(row.status).toBe('sent')
    expect(row.threadRef).toBe(retry.outbox[0]!.messageId)
  })
})

describe('marking a step sent by hand', () => {
  it('records the send with no thread reference, because there is none', async () => {
    const { applicationId, stepId } = await seed({ email: null })

    const row = await markSentManually(stepId)

    expect(row.status).toBe('sent')
    expect(row.sentAt).toBeInstanceOf(Date)
    expect(row.threadRef).toBeNull()

    const application = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })
    expect(application.status).toBe('outreach')
  })
})

describe('the copy affordance', () => {
  it('lays the message out as headers a mail client can be filled from', () => {
    const text = messageText(
      { subject: 'Quick note on the SBE role', body: 'Hi Jordan —\n\nI own a ledger service.' },
      { name: 'Jordan Lee', email: 'jordan@example.com' },
    )

    expect(text).toBe(
      [
        'To: Jordan Lee <jordan@example.com>',
        'Subject: Quick note on the SBE role',
        '',
        'Hi Jordan —',
        '',
        'I own a ledger service.',
      ].join('\n'),
    )
  })

  it('drops the To line when there is nobody to address it to', () => {
    const text = messageText({ subject: 'Following up', body: 'Circling back —' }, null)

    expect(text).toBe('Subject: Following up\n\nCircling back —')
  })
})
