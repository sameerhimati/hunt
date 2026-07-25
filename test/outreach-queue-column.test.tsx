// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { OutreachQueue } from '@/components/outreach/outreach-queue'
import type { QueueEntry, QueueGroup } from '@/lib/outreach/types'

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

function entry(overrides: Partial<QueueEntry>): QueueEntry {
  return {
    applicationId: 'app-1',
    contactId: 'contact-1',
    contactName: 'Dana Reyes',
    company: 'Stripe',
    title: 'Senior Backend Engineer',
    state: 'due',
    nextStep: { id: 'step-1', sequenceStep: 2, status: 'scheduled', dueAt: new Date() },
    ...overrides,
  }
}

const groups: QueueGroup[] = [
  { label: 'Due today', entries: [entry({})] },
  {
    label: 'Active',
    entries: [
      entry({
        applicationId: 'app-2',
        contactId: 'contact-2',
        contactName: 'Priya Nair',
        company: 'Figma',
        state: 'replied',
        nextStep: null,
      }),
      entry({
        applicationId: 'app-3',
        contactId: null,
        contactName: 'Sam Ortiz',
        company: 'Linear',
        state: 'active',
        nextStep: { id: 'step-3', sequenceStep: 3, status: 'scheduled', dueAt: new Date() },
      }),
    ],
  },
]

describe('OutreachQueue', () => {
  it('keeps the testid container when the queue is empty', () => {
    render(<OutreachQueue groups={[]} />)
    const container = screen.getByTestId('outreach-queue')
    expect(container.textContent).toContain('No sequences yet')
    // The header survives the empty state too.
    expect(container.textContent).toContain('Outreach')
  })

  it('counts due entries in the header pill', () => {
    render(<OutreachQueue groups={groups} />)
    expect(screen.getByText('1 due')).toBeTruthy()
  })

  it('hides the pill when nothing is due', () => {
    render(<OutreachQueue groups={[groups[1]]} />)
    expect(screen.queryByText(/\d+ due$/)).toBeNull()
  })

  it('renders group labels and one row per entry, in order', () => {
    render(<OutreachQueue groups={groups} />)
    expect(screen.getByText('Due today')).toBeTruthy()
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows initials, name, and the company · step subline', () => {
    render(<OutreachQueue groups={groups} />)
    expect(screen.getByText('DR')).toBeTruthy()
    expect(screen.getByText('Dana Reyes')).toBeTruthy()
    expect(screen.getByText('step 2 due')).toBeTruthy()
    expect(screen.getByText(/Figma · replied ✓/)).toBeTruthy()
    expect(screen.getByText(/Linear · step 3 scheduled/)).toBeTruthy()
  })

  it('links each row to the composer by contact, falling back to application', () => {
    render(<OutreachQueue groups={groups} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '/outreach?contact=contact-1',
      '/outreach?contact=contact-2',
      '/outreach?application=app-3',
    ])
  })

  it('marks the selected row by contact or application id', () => {
    render(<OutreachQueue groups={groups} selected="app-3" />)
    const selectedRows = screen
      .getAllByRole('link')
      .filter((a) => a.hasAttribute('data-selected'))
    expect(selectedRows).toHaveLength(1)
    expect(selectedRows[0].textContent).toContain('Sam Ortiz')
  })

  it('selects nothing when selected is undefined, even with null contactIds around', () => {
    render(<OutreachQueue groups={groups} />)
    const selectedRows = screen
      .getAllByRole('link')
      .filter((a) => a.hasAttribute('data-selected'))
    expect(selectedRows).toHaveLength(0)
  })
})
