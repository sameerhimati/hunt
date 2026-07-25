// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OutreachStepView, SequenceView } from '@/lib/outreach/types'

/**
 * The card is read-only over `sequenceView`, so the read model is mocked and
 * the DB round-trip is covered by test/outreach-queue.test.ts. What matters
 * here is the rendering contract: the empty state names what fills it, and a
 * live sequence prints step number, subject, status word, day offset, sentAt.
 */
vi.mock('@/lib/outreach/queue', () => ({ sequenceView: vi.fn() }))

import { sequenceView } from '@/lib/outreach/queue'
import { OutreachTimeline } from '@/components/application/outreach-timeline'

const mocked = vi.mocked(sequenceView)

afterEach(cleanup)

function step(overrides: Partial<OutreachStepView>): OutreachStepView {
  return {
    id: 'step-1',
    sequenceStep: 1,
    subject: 'Quick note on the SBE role',
    body: 'hi',
    dayOffset: 0,
    cumulativeOffset: 0,
    status: 'sent',
    sentAt: new Date('2026-07-20T12:00:00Z'),
    dueAt: new Date('2026-07-20T12:00:00Z'),
    ...overrides,
  }
}

function view(steps: OutreachStepView[]): SequenceView {
  return {
    applicationId: 'app-1',
    contact: null,
    steps,
    fromAddress: null,
    emailConfigured: false,
  }
}

async function renderCard() {
  render(await OutreachTimeline({ applicationId: 'app-1' }))
}

describe('OutreachTimeline (application detail card)', () => {
  it('renders the empty state when no sequence exists, without naming phases', async () => {
    mocked.mockResolvedValue(null)
    await renderCard()

    const card = screen.getByTestId('application-outreach-timeline')
    expect(card.textContent).toContain('Outreach')
    expect(card.textContent).toContain('No messages yet')
    expect(card.textContent).toContain('draft a sequence')
    expect(card.textContent).not.toMatch(/[Pp]hase/)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('treats a sequence with no steps as empty (contact exists, nothing drafted)', async () => {
    mocked.mockResolvedValue(view([]))
    await renderCard()
    expect(screen.getByText(/No messages yet/)).toBeTruthy()
  })

  it('lists steps with number, subject, status word, day offset and sentAt date', async () => {
    mocked.mockResolvedValue(
      view([
        step({}),
        step({
          id: 'step-2',
          sequenceStep: 2,
          subject: 'Following up',
          cumulativeOffset: 4,
          status: 'scheduled',
          sentAt: null,
          dueAt: new Date('2026-07-24T12:00:00Z'),
        }),
      ]),
    )
    await renderCard()

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Step 1 · Quick note on the SBE role')).toBeTruthy()
    expect(screen.getByText('sent · day 0 · 2026-07-20')).toBeTruthy()
    expect(screen.getByText('Step 2 · Following up')).toBeTruthy()
    // Unsent step: cumulative offset in the mockup's `day +N` grammar, no date.
    expect(screen.getByText('scheduled · day +4')).toBeTruthy()
  })

  it('links to the Outreach screen scoped to this application', async () => {
    mocked.mockResolvedValue(view([step({})]))
    await renderCard()

    const link = screen.getByRole('link', { name: 'Open in Outreach' })
    expect(link.getAttribute('href')).toBe('/outreach?application=app-1')
  })
})
