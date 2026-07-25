// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PersonHit } from '@/lib/adapters/people/types'
import type { ContactView } from '@/lib/outreach/types'

/**
 * The card's interactive half. The server actions are mocked: what is under
 * test is the affordance — that a row expands to exactly one draft button, that
 * the manual-add path is there with no key configured, and that the card names
 * the résumé a draft would cite *before* you press the button.
 */
type LookupResult = { hits: PersonHit[]; reason: string | null; error?: string }

const draftOutreachAction = vi.fn<(a: string, c: string) => Promise<{ error?: string }>>()
const saveContactAction = vi.fn<(input: unknown) => Promise<{ error?: string }>>()
const deleteContactAction = vi.fn<(id: string) => Promise<{ error?: string }>>()
const findContactsAction = vi.fn<(applicationId: string) => Promise<LookupResult>>()

vi.mock('@/app/outreach/contact-actions', () => ({
  draftOutreachAction: (a: string, c: string) => draftOutreachAction(a, c),
  saveContactAction: (input: unknown) => saveContactAction(input),
  deleteContactAction: (id: string) => deleteContactAction(id),
  findContactsAction: (id: string) => findContactsAction(id),
}))

const { ContactActions, ContactCard } = await import('@/components/application/contact-card')

const contact: ContactView = {
  id: 'contact-1',
  name: 'Jordan Lee',
  title: 'Technical Recruiter',
  company: 'Northwind Robotics',
  email: 'jordan@example.com',
  linkedinUrl: null,
  source: 'manual',
}

const pinnedNotice = { pinned: true, resumeName: 'Alex Chen', label: 'v4' }

beforeAll(() => {
  // Radix reaches for APIs jsdom doesn't implement.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  draftOutreachAction.mockReset().mockResolvedValue({})
  saveContactAction.mockReset().mockResolvedValue({})
  deleteContactAction.mockReset().mockResolvedValue({})
  findContactsAction.mockReset().mockResolvedValue({ hits: [], reason: null })
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

describe('ContactCard', () => {
  it('opens by default and offers exactly one draft button', () => {
    render(
      <ContactCard contact={contact} applicationId="app-1" draftNotice={pinnedNotice} defaultOpen />,
    )

    const card = screen.getByTestId('contact-card')
    expect(card.textContent).toContain('Jordan Lee')
    expect(card.textContent).toContain('Technical Recruiter')
    expect(screen.getAllByTestId('draft-outreach')).toHaveLength(1)
  })

  it('keeps a collapsed row out of the DOM so a second card cannot shadow the first', () => {
    render(<ContactCard contact={contact} applicationId="app-1" draftNotice={pinnedNotice} />)

    expect(screen.queryByTestId('draft-outreach')).toBeNull()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByTestId('draft-outreach')).toBeTruthy()
  })

  it('names the pinned version the draft will cite', () => {
    render(
      <ContactCard contact={contact} applicationId="app-1" draftNotice={pinnedNotice} defaultOpen />,
    )

    expect(screen.getByText(/Cites Alex Chen · v4/)).toBeTruthy()
  })

  it('says so out loud when the draft falls back to an unpinned résumé', () => {
    render(
      <ContactCard
        contact={contact}
        applicationId="app-1"
        draftNotice={{ pinned: false, resumeName: 'Alex Chen', label: 'Base' }}
        defaultOpen
      />,
    )

    expect(screen.getByText(/Nothing pinned/)).toBeTruthy()
  })

  it('shows the missing-email state without hiding the actions', () => {
    render(
      <ContactCard
        contact={{ ...contact, email: null }}
        applicationId="app-1"
        draftNotice={pinnedNotice}
        defaultOpen
      />,
    )

    expect(screen.getByText('no email')).toBeTruthy()
    expect(screen.getByTestId('draft-outreach')).toBeTruthy()
  })

  it('drafts against this application and contact', async () => {
    render(
      <ContactCard contact={contact} applicationId="app-1" draftNotice={pinnedNotice} defaultOpen />,
    )

    fireEvent.click(screen.getByTestId('draft-outreach'))

    await waitFor(() => expect(draftOutreachAction).toHaveBeenCalledWith('app-1', 'contact-1'))
  })

  it('surfaces a failed draft in the card instead of losing it', async () => {
    draftOutreachAction.mockResolvedValueOnce({ error: 'Anthropic: 429 — rate limited' })

    render(
      <ContactCard contact={contact} applicationId="app-1" draftNotice={pinnedNotice} defaultOpen />,
    )
    fireEvent.click(screen.getByTestId('draft-outreach'))

    await waitFor(() => expect(screen.getByText(/rate limited/)).toBeTruthy())
  })
})

describe('ContactActions', () => {
  it('offers the manual dialog with no provider configured', async () => {
    render(<ContactActions applicationId="app-1" apolloReady={false} />)

    fireEvent.click(screen.getByTestId('add-contact-manual'))

    await waitFor(() => expect(screen.getByTestId('contact-name')).toBeTruthy())
    expect(screen.getByTestId('contact-email')).toBeTruthy()

    fireEvent.change(screen.getByTestId('contact-name'), { target: { value: 'Jordan Lee' } })
    fireEvent.change(screen.getByTestId('contact-email'), {
      target: { value: 'jordan@example.com' },
    })
    fireEvent.click(screen.getByTestId('save-contact'))

    await waitFor(() =>
      expect(saveContactAction).toHaveBeenCalledWith({
        applicationId: 'app-1',
        name: 'Jordan Lee',
        title: '',
        email: 'jordan@example.com',
      }),
    )
  })

  it('keeps the lookup visible with no key and does not repeat what the card already said', async () => {
    findContactsAction.mockResolvedValueOnce({
      hits: [],
      reason: 'Outreach still drafts and sends fine — you just will not get auto-found contacts.',
    })

    render(<ContactActions applicationId="app-1" apolloReady={false} />)
    fireEvent.click(screen.getByTestId('find-contacts'))

    await waitFor(() => expect(findContactsAction).toHaveBeenCalled())
    expect(screen.queryByTestId('find-contacts-reason')).toBeNull()
  })

  it('lists hits with a save button when the lookup answers', async () => {
    findContactsAction.mockResolvedValueOnce({
      hits: [
        {
          name: 'Dana Whitfield',
          title: 'Technical Recruiter',
          email: 'dana@northwind.example',
          source: 'apollo',
        },
      ],
      reason: null,
    })

    render(<ContactActions applicationId="app-1" apolloReady />)
    fireEvent.click(screen.getByTestId('find-contacts'))

    await waitFor(() => expect(screen.getByText('Dana Whitfield')).toBeTruthy())
    fireEvent.click(screen.getByTestId('save-found-contact'))

    await waitFor(() =>
      expect(saveContactAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dana Whitfield', source: 'apollo' }),
      ),
    )
  })

  it('reports a provider failure verbatim instead of an empty list', async () => {
    findContactsAction.mockResolvedValueOnce({ hits: [], reason: 'Apollo: over plan limit' })

    render(<ContactActions applicationId="app-1" apolloReady />)
    fireEvent.click(screen.getByTestId('find-contacts'))

    await waitFor(() =>
      expect(screen.getByTestId('find-contacts-reason').textContent).toContain('over plan limit'),
    )
  })
})
