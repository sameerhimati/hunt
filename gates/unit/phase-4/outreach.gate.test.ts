import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 4 exit gate — cited drafting and the send path.
// RED until src/lib/outreach/{draft,send}.ts exist and FakeEmailAdapter
// gains file capture (constructor option { captureFile }) so the e2e gate can
// observe sends across the process boundary.
import { draftOutreach } from '@/lib/outreach/draft'
import { sendStep } from '@/lib/outreach/send'
import { createSequence } from '@/lib/outreach/sequence'
import { FakeEmailAdapter } from '@/lib/adapters/email/fake'
import { FakeLlmProvider } from '@/lib/llm'
import { parseResumeContent } from '@/lib/resume/schema'
import { dataDir } from '@/lib/paths'
import { prisma } from '@/lib/db/client'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))

describe('outreach drafting', () => {
  it('drafts a message citing real résumé highlights', async () => {
    const llm = new FakeLlmProvider({
      responder: () =>
        JSON.stringify({
          subject: 'Senior Backend Engineer — payments reliability background',
          body: 'Hi Jordan — I own a ledger service settling $40M/month and cut p99 from 210ms to 130ms. The charge-path reliability work at Stripe maps directly.',
          citations: [{ path: 'experience[0].bullets[0]' }, { path: 'experience[0].bullets[3]' }],
        }),
    })

    const draft = await draftOutreach({
      content: parseResumeContent(alexChen),
      job: { title: 'Senior Backend Engineer', company: 'Stripe' },
      contact: { name: 'Jordan Lee', title: 'Technical Recruiter' },
      llm,
    })

    expect(draft.subject).toBeTruthy()
    expect(draft.body).toContain('p99')
    // Citations must resolve into the résumé — same provenance rule as tailoring.
    expect(draft.citations.length).toBeGreaterThan(0)
    for (const c of draft.citations) expect(c.path).toMatch(/^\w+\[\d+\]/)
  })
})

describe('send path', () => {
  it('sends step 1, captures it to the outbox file, and stamps the row', async () => {
    const job = await prisma.job.create({
      data: { title: 'SBE', company: `Stripe-${Math.random()}`, jdText: 'JD' },
    })
    const application = await prisma.application.create({
      data: { jobId: job.id, status: 'outreach' },
    })
    const contact = await prisma.contact.create({
      data: { applicationId: application.id, name: 'Jordan Lee', email: 'jordan@example.com' },
    })
    const [step] = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [{ subject: 'Quick note', body: 'hello', dayOffset: 0 }],
    })

    const captureFile = path.join(dataDir(), 'outbox.jsonl')
    const email = new FakeEmailAdapter({ captureFile })

    await sendStep(step.id, { email, from: 'alex.chen@example.com' })

    const row = await prisma.outreach.findUniqueOrThrow({ where: { id: step.id } })
    expect(row.status).toBe('sent')
    expect(row.sentAt).toBeInstanceOf(Date)
    expect(row.threadRef).toBeTruthy()

    const outbox = fs
      .readFileSync(captureFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const sent = outbox.find((m) => m.subject === 'Quick note')
    expect(sent?.to).toBe('jordan@example.com')
  })
})
