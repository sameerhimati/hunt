// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SequenceTimeline } from '@/components/outreach/sequence-timeline'
import type { OutreachStepView } from '@/lib/outreach/types'

const markRepliedAction = vi.fn(async () => ({}) as { error?: string })

vi.mock('@/app/outreach/actions', () => ({
  markRepliedAction: (...args: unknown[]) => markRepliedAction(...(args as [])),
}))

beforeEach(() => {
  markRepliedAction.mockClear().mockResolvedValue({})
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

function step(over: Partial<OutreachStepView>): OutreachStepView {
  return {
    id: 's1',
    sequenceStep: 1,
    subject: 'Intro',
    body: 'hi',
    dayOffset: 0,
    cumulativeOffset: 0,
    status: 'scheduled',
    sentAt: null,
    dueAt: new Date('2026-07-01'),
    ...over,
  }
}

// The mockup's three-step rail: sent / editing / scheduled.
const STEPS: OutreachStepView[] = [
  step({ id: 's1', sequenceStep: 1, subject: 'Intro', status: 'sent', sentAt: new Date() }),
  step({ id: 's2', sequenceStep: 2, subject: 'Follow-up', dayOffset: 4, cumulativeOffset: 4 }),
  step({ id: 's3', sequenceStep: 3, subject: 'Last nudge', dayOffset: 5, cumulativeOffset: 9 }),
]

describe('SequenceTimeline', () => {
  it('renders the gate testids: sequence-timeline and one sequence-step per step', () => {
    render(<SequenceTimeline steps={STEPS} />)
    expect(screen.getByTestId('sequence-timeline')).toBeTruthy()
    expect(screen.getAllByTestId('sequence-step')).toHaveLength(3)
  })

  it('prints "Step N · <label>" and the literal status with the cumulative day', () => {
    render(<SequenceTimeline steps={STEPS} />)
    const [first, , third] = screen.getAllByTestId('sequence-step')
    expect(first.textContent).toContain('Step 1 · Intro')
    expect(first.textContent).toContain('sent · day 0') // /sent/i is what the e2e gate greps for
    expect(third.textContent).toContain('Step 3 · Last nudge')
    expect(third.textContent).toContain('scheduled · day +9')
  })

  it('marks the active step with data-active and an "editing" suffix', () => {
    render(<SequenceTimeline steps={STEPS} activeStepId="s2" />)
    const [first, second] = screen.getAllByTestId('sequence-step')
    expect(second.hasAttribute('data-active')).toBe(true)
    expect(second.textContent).toContain('day +4 · editing')
    expect(first.hasAttribute('data-active')).toBe(false)
    expect(first.textContent).not.toContain('editing')
  })

  it('calls onSelect with the step id when a step is clicked', () => {
    const onSelect = vi.fn()
    render(<SequenceTimeline steps={STEPS} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Step 2 · Follow-up'))
    expect(onSelect).toHaveBeenCalledWith('s2')
  })

  it('falls back to ?step=<id> links when no onSelect is given', () => {
    render(<SequenceTimeline steps={STEPS} />)
    const link = screen.getByText('Step 3 · Last nudge').closest('a')
    expect(link?.getAttribute('href')).toBe('?step=s3')
  })

  it('never claims it notices a reply on its own', () => {
    render(<SequenceTimeline steps={STEPS} />)

    // hunt does not read anyone's inbox. Inbound mail is Phase 7 and is not
    // built, so "halts automatically" was a capability the product did not have.
    const rail = screen.getByTestId('sequence-timeline').textContent ?? ''
    expect(rail).not.toMatch(/automatic/i)
    expect(rail).toMatch(/cannot see your inbox/i)
  })

  it('halts the sequence on the sent step when the user says they replied', async () => {
    render(<SequenceTimeline steps={STEPS} />)

    fireEvent.click(screen.getByTestId('mark-replied'))

    // The reply lands on the message that actually went out — step 1 here.
    await waitFor(() => expect(markRepliedAction).toHaveBeenCalledWith('s1'))
  })

  it('offers nothing to reply to before anything has been sent', () => {
    render(<SequenceTimeline steps={[step({ id: 's1', status: 'scheduled' })]} />)
    expect(screen.queryByTestId('mark-replied')).toBeNull()
  })

  it('says the sequence stopped once a reply is recorded, and stops offering', () => {
    render(
      <SequenceTimeline
        steps={[
          step({ id: 's1', status: 'replied', sentAt: new Date() }),
          step({ id: 's2', sequenceStep: 2, status: 'halted' }),
        ]}
      />,
    )

    expect(screen.queryByTestId('mark-replied')).toBeNull()
    expect(screen.getByTestId('sequence-timeline').textContent).toMatch(/replied on step 1/i)
  })
})
