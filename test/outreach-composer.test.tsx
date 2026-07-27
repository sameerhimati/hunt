// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Composer } from '@/components/outreach/composer'
import type { OutreachStepView, SequenceView } from '@/lib/outreach/types'

/**
 * The composer's contract with the rest of Phase 4: which step it opens, what
 * the send row offers when hunt cannot send, and that nothing is ever sent
 * without the edit on screen being saved first.
 *
 * Server actions are mocked — this file is about the UI's behaviour, and the
 * actions themselves are exercised through the gate's send/sequence tests.
 */
const sendStepAction = vi.fn(async () => ({}) as { error?: string; note?: string })
const saveDraftAction = vi.fn(async () => ({}) as { error?: string })
const markSentManuallyAction = vi.fn(async () => ({}) as { error?: string })
const regenerateAction = vi.fn(
  async () =>
    ({}) as {
      error?: string
      subject?: string
      body?: string
      citations?: { path: string; snippet?: string }[]
    },
)

vi.mock('@/app/outreach/actions', () => ({
  sendStepAction: (...args: unknown[]) => sendStepAction(...(args as [])),
  saveDraftAction: (...args: unknown[]) => saveDraftAction(...(args as [])),
  markSentManuallyAction: (...args: unknown[]) => markSentManuallyAction(...(args as [])),
  regenerateAction: (...args: unknown[]) => regenerateAction(...(args as [])),
}))

function step(overrides: Partial<OutreachStepView> = {}): OutreachStepView {
  return {
    id: 'step-1',
    sequenceStep: 1,
    subject: 'Senior Backend Engineer — payments reliability background',
    body: 'Hi Jordan — I own a ledger service settling $40M/month.',
    dayOffset: 0,
    cumulativeOffset: 0,
    status: 'scheduled',
    sentAt: null,
    dueAt: new Date('2026-07-25T09:00:00.000Z'),
    ...overrides,
  }
}

function sequence(overrides: Partial<SequenceView> = {}): SequenceView {
  return {
    applicationId: 'app-1',
    contact: {
      id: 'contact-1',
      name: 'Jordan Lee',
      title: 'Technical Recruiter',
      company: 'Stripe',
      email: 'jordan@example.com',
      linkedinUrl: null,
      source: 'apollo',
    },
    steps: [step()],
    fromAddress: 'alex@chen.dev',
    emailConfigured: true,
    ...overrides,
  }
}

beforeEach(() => {
  sendStepAction.mockClear().mockResolvedValue({})
  saveDraftAction.mockClear().mockResolvedValue({})
  markSentManuallyAction.mockClear().mockResolvedValue({})
  regenerateAction.mockClear().mockResolvedValue({})
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

describe('composer', () => {
  it('opens on the drafted step and names who it is going to and from', () => {
    render(<Composer sequence={sequence()} />)

    expect(screen.getByTestId('composer-contact').textContent).toContain('Jordan Lee')
    expect(screen.getByTestId('composer-contact').textContent).toContain('Technical Recruiter')
    expect(screen.getByText(/sending from/)).toBeTruthy()
    expect(screen.getByText('alex@chen.dev')).toBeTruthy()

    // The gate reads this field: a drafted step must arrive with copy in it.
    const subject = screen.getByTestId('message-subject') as HTMLInputElement
    expect(subject.value).toContain('Senior Backend Engineer')
    expect((screen.getByTestId('message-body') as HTMLTextAreaElement).value).toContain('ledger')
  })

  it('opens the first step still waiting, not the one already sent', () => {
    render(
      <Composer
        sequence={sequence({
          steps: [
            step({ id: 'sent-1', status: 'sent', sentAt: new Date('2026-07-20T09:00:00.000Z') }),
            step({ id: 'next-2', sequenceStep: 2, subject: 'Following up', body: 'bump' }),
          ],
        })}
      />,
    )

    expect((screen.getByTestId('message-subject') as HTMLInputElement).value).toBe('Following up')
  })

  it('keeps the manual escape hatch reachable even when hunt can send', () => {
    render(<Composer sequence={sequence()} />)

    // The e2e gate asserts attachment, not visibility: the item lives in the
    // send menu, so it must be in the DOM before anyone opens it.
    expect(screen.getByTestId('send-now')).toBeTruthy()
    expect(screen.getByTestId('mark-sent-manually')).toBeTruthy()
  })

  it('opens the send menu and marks the step sent by hand', async () => {
    render(<Composer sequence={sequence()} />)

    const item = screen.getByTestId('mark-sent-manually')
    expect(item.closest('[role="menu"]')?.hasAttribute('hidden')).toBe(true)

    fireEvent.click(screen.getByTestId('send-options'))
    expect(item.closest('[role="menu"]')?.hasAttribute('hidden')).toBe(false)

    fireEvent.click(item)
    await waitFor(() => expect(markSentManuallyAction).toHaveBeenCalledWith('step-1'))
    expect(sendStepAction).not.toHaveBeenCalled()
  })

  it('degrades to copy / mark as sent when no email provider is configured', () => {
    render(<Composer sequence={sequence({ emailConfigured: false })} />)

    expect(screen.queryByTestId('send-now')).toBeNull()
    expect(screen.getByTestId('copy-message')).toBeTruthy()
    expect(screen.getByTestId('mark-sent-manually')).toBeTruthy()
    // The composer still drafts and still saves — that is the whole promise.
    expect(screen.getByTestId('save-draft')).toBeTruthy()
    expect(screen.getByTestId('regenerate')).toBeTruthy()
  })

  it('saves an unsaved edit before sending it', async () => {
    render(<Composer sequence={sequence()} />)

    fireEvent.change(screen.getByTestId('message-body'), { target: { value: 'Rewritten by hand.' } })
    fireEvent.click(screen.getByTestId('send-now'))

    await waitFor(() =>
      expect(sendStepAction).toHaveBeenCalledWith('step-1', { confirmResend: false }),
    )
    expect(saveDraftAction).toHaveBeenCalledWith('step-1', {
      subject: 'Senior Backend Engineer — payments reliability background',
      body: 'Rewritten by hand.',
    })
    expect(saveDraftAction.mock.invocationCallOrder[0]).toBeLessThan(
      sendStepAction.mock.invocationCallOrder[0],
    )
  })

  it('sends untouched copy without a pointless write', async () => {
    render(<Composer sequence={sequence()} />)

    fireEvent.click(screen.getByTestId('send-now'))

    await waitFor(() =>
      expect(sendStepAction).toHaveBeenCalledWith('step-1', { confirmResend: false }),
    )
    expect(saveDraftAction).not.toHaveBeenCalled()
  })

  it('shows a failed send in place instead of losing the message', async () => {
    sendStepAction.mockResolvedValue({ error: 'Resend: no email provider is configured.' })
    render(<Composer sequence={sequence()} />)

    fireEvent.click(screen.getByTestId('send-now'))

    await waitFor(() =>
      expect(screen.getByTestId('composer-error').textContent).toContain('no email provider'),
    )
    expect((screen.getByTestId('message-body') as HTMLTextAreaElement).value).toContain('ledger')
  })

  it('puts a regenerated draft in the box with the citations it survived on', async () => {
    regenerateAction.mockResolvedValue({
      subject: 'Payments reliability — Senior Backend Engineer',
      body: 'Hi Jordan — I cut p99 from 210ms to 130ms.',
      citations: [{ path: 'experience[0].bullets[3]', snippet: 'Cut p99 latency 38%' }],
    })
    render(<Composer sequence={sequence()} />)

    fireEvent.click(screen.getByTestId('regenerate'))

    await waitFor(() =>
      expect((screen.getByTestId('message-subject') as HTMLInputElement).value).toBe(
        'Payments reliability — Senior Backend Engineer',
      ),
    )
    expect(screen.getByTestId('citation-chip').textContent).toBe('experience[0].bullets[3]')

    // Regenerating does not write: the new draft is unsaved until it is sent
    // or saved, so sending must persist it first.
    fireEvent.click(screen.getByTestId('send-now'))
    await waitFor(() =>
      expect(saveDraftAction).toHaveBeenCalledWith('step-1', {
        subject: 'Payments reliability — Senior Backend Engineer',
        body: 'Hi Jordan — I cut p99 from 210ms to 130ms.',
      }),
    )
  })

  it('will not offer to send or hand-send a step that already went out', () => {
    render(
      <Composer
        sequence={sequence({
          steps: [step({ status: 'sent', sentAt: new Date('2026-07-20T09:00:00.000Z') })],
        })}
      />,
    )

    expect((screen.getByTestId('send-now') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('mark-sent-manually') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/2026-07-20/)).toBeTruthy()
  })

  it('says it does not know, rather than "not sent", after an unconfirmed attempt', async () => {
    // A step the send path claimed and never heard back about: still pending,
    // but carrying a sentAt. Calling that "scheduled" would assert the message
    // never left, which is the one thing hunt cannot know.
    render(
      <Composer
        sequence={sequence({
          steps: [step({ status: 'scheduled', sentAt: new Date('2026-07-20T09:00:00.000Z') })],
        })}
      />,
    )

    expect(screen.getByTestId('send-unconfirmed').textContent).toMatch(/never got an answer back/i)
    expect(screen.getByTestId('sequence-step').textContent).toContain('unconfirmed')
    expect(screen.getByTestId('sequence-step').textContent).not.toContain('scheduled')

    // Pressing the button here is the user saying the first attempt never landed.
    expect(screen.getByTestId('send-now').textContent).toBe('Send again')
    fireEvent.click(screen.getByTestId('send-now'))
    await waitFor(() =>
      expect(sendStepAction).toHaveBeenCalledWith('step-1', { confirmResend: true }),
    )
  })

  it('does not paint "already sent" red — it is a normal outcome, not a failure', async () => {
    sendStepAction.mockResolvedValue({ note: 'That step already went out — nothing sent again.' })
    render(<Composer sequence={sequence()} />)

    fireEvent.click(screen.getByTestId('send-now'))

    await waitFor(() =>
      expect(screen.getByTestId('composer-note').textContent).toContain('already went out'),
    )
    expect(screen.queryByTestId('composer-error')).toBeNull()
  })

  it('says what to do when there is no sequence at all', () => {
    render(<Composer sequence={null} />)

    expect(screen.queryByTestId('message-subject')).toBeNull()
    expect(screen.getByText(/Nothing to write yet/)).toBeTruthy()
  })
})
