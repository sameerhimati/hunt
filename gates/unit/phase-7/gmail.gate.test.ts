import { afterEach, describe, expect, it, vi } from 'vitest'

// Phase 7 exit gate — user-owned Gmail OAuth + the closed loop (reply detection
// flips status and halts sequences). Runs against mocked fetch, no network.
// RED until src/lib/adapters/email/gmail.ts, src/lib/google/oauth.ts and
// src/lib/outreach/reply-detection.ts exist.
//
// VERIFIER GAP (P7's first task): author the Gmail API mock fixtures (token
// exchange, users.messages.send, users.threads.get) from the public API shapes.
import { GmailAdapter } from '@/lib/adapters/email/gmail'
import { exchangeCode } from '@/lib/google/oauth'
import { pollReplies } from '@/lib/outreach/reply-detection'
import { createSequence } from '@/lib/outreach/sequence'
import { prisma } from '@/lib/db/client'

afterEach(() => vi.unstubAllGlobals())

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const match = Object.entries(routes).find(([prefix]) => url.includes(prefix))
      if (!match) throw new Error(`unmocked fetch: ${url}`)
      return new Response(JSON.stringify(match[1]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

describe('user-owned OAuth', () => {
  it('exchanges an auth code with the user’s own client credentials', async () => {
    mockFetch({
      'oauth2.googleapis.com/token': {
        access_token: 'ya29.fake',
        refresh_token: '1//fake-refresh',
        expires_in: 3599,
      },
    })

    const tokens = await exchangeCode({
      clientId: 'user-client.apps.googleusercontent.com',
      clientSecret: 'user-secret',
      code: '4/fake-code',
      redirectUri: 'http://localhost:3000/api/google/callback',
    })

    expect(tokens.accessToken).toBe('ya29.fake')
    expect(tokens.refreshToken).toBe('1//fake-refresh')
  })
})

describe('sending', () => {
  it('sends via the Gmail API and returns the thread reference', async () => {
    mockFetch({
      'gmail/v1/users/me/messages/send': { id: 'msg-1', threadId: 'thread-42' },
    })

    const adapter = new GmailAdapter({ accessToken: 'ya29.fake', from: 'alex@gmail.com' })
    const result = await adapter.send({
      to: 'jordan@example.com',
      from: 'alex@gmail.com',
      subject: 'Quick note',
      text: 'hello',
    })

    expect(result.messageId).toBe('thread-42')
  })
})

describe('reply detection — the closed loop', () => {
  it('flips outreach + application to replied and halts the rest of the sequence', async () => {
    const job = await prisma.job.create({
      data: { title: 'SBE', company: `Stripe-${Math.random()}`, jdText: 'JD' },
    })
    const application = await prisma.application.create({
      data: { jobId: job.id, status: 'outreach' },
    })
    const contact = await prisma.contact.create({
      data: { applicationId: application.id, name: 'Jordan Lee', email: 'jordan@example.com' },
    })
    const steps = await createSequence({
      applicationId: application.id,
      contactId: contact.id,
      steps: [
        { subject: 's1', body: 'b', dayOffset: 0 },
        { subject: 's2', body: 'b', dayOffset: 3 },
      ],
    })
    await prisma.outreach.update({
      where: { id: steps[0].id },
      data: { status: 'sent', sentAt: new Date(), threadRef: 'thread-42' },
    })

    // Thread now contains a second message from the contact, not us.
    mockFetch({
      'gmail/v1/users/me/threads/thread-42': {
        id: 'thread-42',
        messages: [
          { id: 'msg-1', payload: { headers: [{ name: 'From', value: 'alex@gmail.com' }] } },
          { id: 'msg-2', payload: { headers: [{ name: 'From', value: 'Jordan Lee <jordan@example.com>' }] } },
        ],
      },
    })

    const flipped = await pollReplies({ accessToken: 'ya29.fake', selfEmail: 'alex@gmail.com' })
    expect(flipped).toContain(steps[0].id)

    const outreach = await prisma.outreach.findUniqueOrThrow({ where: { id: steps[0].id } })
    expect(outreach.status).toBe('replied')

    const app = await prisma.application.findUniqueOrThrow({ where: { id: application.id } })
    expect(app.status).toBe('replied')

    const followUp = await prisma.outreach.findUniqueOrThrow({ where: { id: steps[1].id } })
    expect(['halted']).toContain(followUp.status)
  })
})
