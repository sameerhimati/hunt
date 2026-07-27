// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FollowUpRow } from '@/lib/outreach/queue'

// The panel is a Server Component: everything it touches (the queue read model,
// the send path, the adapter factory, Next's cache/navigation) is stubbed so the
// test asserts the *panel's* behaviour — count, copy, degrade, action wiring —
// and not Prisma's.
const followUpsDue = vi.hoisted(() => vi.fn<() => Promise<FollowUpRow[]>>())
const createAdapter = vi.hoisted(() => vi.fn<(id: string) => Promise<unknown>>())
const sendStep = vi.hoisted(() => vi.fn())
const markSentManually = vi.hoisted(() => vi.fn())
const revalidatePath = vi.hoisted(() => vi.fn())
// The real `redirect` throws; the stub returns, which is why the action returns
// its result rather than falling through to the revalidations.
const redirect = vi.hoisted(() => vi.fn())

vi.mock('@/lib/outreach/queue', () => ({ followUpsDue }))
vi.mock('@/lib/adapters/factory', () => ({ createAdapter }))
vi.mock('@/lib/outreach/send', () => ({ sendStep, markSentManually }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next/navigation', () => ({ redirect }))

const { FollowUpsPanel } = await import('@/components/dashboard/follow-ups')

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

function row(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: 'step-1',
    applicationId: 'app-1',
    contactId: 'contact-1',
    sequenceStep: 2,
    dayOffset: 4,
    subject: 'Following up',
    body: 'Hello again',
    status: 'scheduled',
    dueAt: new Date('2026-03-01T09:00:00Z'),
    sentAt: null,
    company: 'Stripe',
    title: 'Senior Backend Engineer',
    contactName: 'Dana Reyes',
    ...overrides,
  }
}

/** Renders the async Server Component's output into jsdom. */
async function renderPanel() {
  render(await FollowUpsPanel())
}

/** The action React attached to a form, as the DOM cannot hand it back. */
function submit(form: HTMLFormElement): Promise<void> {
  const button = form.querySelector('button[type="submit"]') as HTMLButtonElement
  button.click()
  // Actions are dispatched in a transition; a macrotask turn is enough.
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.clearAllMocks()
  createAdapter.mockResolvedValue({ id: 'resend' })
  sendStep.mockResolvedValue({ outcome: 'sent', step: { id: 'step-1' } })
  markSentManually.mockResolvedValue({ id: 'step-1' })
})

describe('FollowUpsPanel', () => {
  it('stays honest and costs nothing when there is nothing due', async () => {
    followUpsDue.mockResolvedValue([])
    await renderPanel()

    expect(screen.getByTestId('follow-ups-count').textContent).toBe('0')
    expect(screen.getByText(/Nothing to nudge/)).toBeTruthy()
    expect(screen.queryByTestId('follow-up-row')).toBeNull()
    // No urgency language invented out of an empty table.
    expect(screen.getByTestId('follow-ups').textContent).not.toMatch(/overdue|urgent|!/i)
    // And no settings read to ask about an email key nobody would use.
    expect(createAdapter).not.toHaveBeenCalled()
  })

  it('counts the rows it renders', async () => {
    followUpsDue.mockResolvedValue([row(), row({ id: 'step-2', applicationId: 'app-2' })])
    await renderPanel()

    expect(screen.getByTestId('follow-ups-count').textContent).toBe('2')
    expect(screen.getAllByTestId('follow-up-row')).toHaveLength(2)
  })

  it('names the human, the company · role, and which step is due', async () => {
    followUpsDue.mockResolvedValue([row()])
    await renderPanel()

    const text = screen.getByTestId('follow-up-row').textContent ?? ''
    expect(text).toContain('Dana Reyes')
    expect(text).toContain('Stripe · Senior Backend Engineer')
    expect(text).toContain('step 2 · day +4')
  })

  it('links each row to its application', async () => {
    followUpsDue.mockResolvedValue([row({ applicationId: 'app-42' })])
    await renderPanel()

    const link = screen.getByTestId('follow-up-row').querySelector('a')
    expect(link?.getAttribute('href')).toBe('/applications/app-42')
  })

  it('still names a row whose contact is gone', async () => {
    followUpsDue.mockResolvedValue([row({ contactId: null, contactName: null })])
    await renderPanel()

    const text = screen.getByTestId('follow-up-row').textContent ?? ''
    expect(text).toContain('No contact yet')
    expect(text).toContain('Stripe')
  })

  it('sends inline when an email provider is configured', async () => {
    followUpsDue.mockResolvedValue([row({ id: 'step-9', applicationId: 'app-9' })])
    await renderPanel()

    expect(screen.queryByTestId('connect-email-nudge')).toBeNull()
    const send = screen.getByTestId('follow-up-send')
    await submit(send.closest('form') as HTMLFormElement)

    expect(sendStep).toHaveBeenCalledWith('step-9')
    expect(markSentManually).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/applications/app-9')
  })

  it('degrades to Draft / Copy with a reason when no email provider is configured', async () => {
    createAdapter.mockResolvedValue(null)
    followUpsDue.mockResolvedValue([row()])
    await renderPanel()

    expect(screen.queryByTestId('follow-up-send')).toBeNull()
    expect(screen.getByTestId('follow-up-draft').getAttribute('href')).toBe(
      '/outreach?application=app-1',
    )
    expect(screen.getByTestId('follow-up-copy')).toBeTruthy()

    // Never a dead button: the row says why it cannot send and where to fix it.
    const nudge = screen.getByTestId('connect-email-nudge')
    expect(nudge.textContent).toMatch(/Connect email/i)
    expect(nudge.querySelector('a')?.getAttribute('href')).toBe('/settings')
  })

  it('records a message the user sent by hand', async () => {
    createAdapter.mockResolvedValue(null)
    followUpsDue.mockResolvedValue([row({ id: 'step-7' })])
    await renderPanel()

    const button = screen.getByTestId('follow-up-mark-sent')
    await submit(button.closest('form') as HTMLFormElement)

    expect(markSentManually).toHaveBeenCalledWith('step-7')
    expect(sendStep).not.toHaveBeenCalled()
  })

  it('shuts the Send button while the send is in flight', async () => {
    // The row's only defence against a second click used to be that nobody
    // clicked twice. Before hydration a bare form is a native POST, so two
    // clicks were two sends with certainty.
    let finish = () => {}
    sendStep.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ outcome: 'sent', step: {} }))),
    )
    followUpsDue.mockResolvedValue([row({ id: 'step-9' })])
    await renderPanel()

    const button = screen.getByTestId('follow-up-send') as HTMLButtonElement
    fireEvent.click(button)

    await waitFor(() => expect(button.disabled).toBe(true))
    expect(button.textContent).toMatch(/sending/i)

    fireEvent.click(button)
    finish()
    await waitFor(() => expect(button.disabled).toBe(false))
    expect(sendStep).toHaveBeenCalledTimes(1)
  })

  it('shuts the Mark sent button while it is writing', async () => {
    createAdapter.mockResolvedValue(null)
    let finish = () => {}
    markSentManually.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve(null))),
    )
    followUpsDue.mockResolvedValue([row({ id: 'step-7' })])
    await renderPanel()

    const button = screen.getByTestId('follow-up-mark-sent') as HTMLButtonElement
    fireEvent.click(button)

    await waitFor(() => expect(button.disabled).toBe(true))
    finish()
    await waitFor(() => expect(button.disabled).toBe(false))
    expect(markSentManually).toHaveBeenCalledTimes(1)
  })

  it('says why a send failed, on the row, and never in the URL', async () => {
    // nodemailer puts host, port and username in its handshake errors. That
    // belongs on the row, not in browser history, the Referer header and every
    // access log between here and there.
    const reason = 'SMTP: 535 auth failed for alex@chen.dev at smtp.fastmail.com:465'
    sendStep.mockRejectedValue(new Error(reason))
    followUpsDue.mockResolvedValue([row({ id: 'step-3', applicationId: 'app-3' })])
    await renderPanel()

    await submit(screen.getByTestId('follow-up-send').closest('form') as HTMLFormElement)

    await waitFor(() =>
      expect(screen.getByTestId('follow-up-error').textContent).toContain('535 auth failed'),
    )
    expect(redirect).not.toHaveBeenCalled()
  })

  it('says a failed hand-mark failed too', async () => {
    createAdapter.mockResolvedValue(null)
    markSentManually.mockRejectedValue(new Error('That step is no longer here.'))
    followUpsDue.mockResolvedValue([row({ id: 'step-7' })])
    await renderPanel()

    await submit(screen.getByTestId('follow-up-mark-sent').closest('form') as HTMLFormElement)

    await waitFor(() =>
      expect(screen.getByTestId('follow-up-error').textContent).toContain('no longer here'),
    )
  })

  it('does not claim a step went out when the send path says it did not', async () => {
    sendStep.mockResolvedValue({ outcome: 'unconfirmed', step: { id: 'step-9' } })
    followUpsDue.mockResolvedValue([row({ id: 'step-9' })])
    await renderPanel()

    await submit(screen.getByTestId('follow-up-send').closest('form') as HTMLFormElement)

    await waitFor(() =>
      expect(screen.getByTestId('follow-up-error').textContent).toMatch(/sent mail/i),
    )
  })
})
