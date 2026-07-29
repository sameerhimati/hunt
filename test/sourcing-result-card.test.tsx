// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FitTierBadge } from '@/components/fit-tier-badge'
import { ResultCard } from '@/components/sourcing/result-card'
import { WhyItFits } from '@/components/sourcing/why-it-fits'
import type { FitReason, FitRating, FitTier } from '@/lib/fit/rate'
import type { JobListing, SourcedResult } from '@/lib/sourcing/types'

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

const listing = (overrides: Partial<JobListing> = {}): JobListing => ({
  externalId: 'a-1',
  title: 'Backend Engineer, Payments',
  company: 'Anthropic',
  location: 'Remote (US)',
  url: 'https://jobs.example.com/a-1',
  source: 'jsearch',
  postedAt: new Date(Date.now() - 2 * 24 * 3_600_000),
  ...overrides,
})

const reason = (overrides: Partial<FitReason> = {}): FitReason => ({
  text: 'Your ledger & payments work maps directly to the role.',
  citations: ['experience[0].bullets[1]'],
  gap: false,
  ...overrides,
})

const rating = (tier: FitTier, reasons = [reason()]): FitRating => ({ tier, reasons })

const result = (overrides: Partial<SourcedResult> = {}): SourcedResult => ({
  listing: listing(),
  rating: rating('strong'),
  ...overrides,
})

describe('FitTierBadge', () => {
  it('speaks only in tiers the e2e vocabulary recognises', () => {
    for (const tier of ['strong', 'possible', 'reach'] as const) {
      render(<FitTierBadge tier={tier} />)
      expect(screen.getByTestId('fit-tier-badge').textContent).toMatch(
        /strong|possible|reach/i,
      )
      cleanup()
    }
  })

  it('never renders a number', () => {
    const { container } = render(<FitTierBadge tier="strong" reasons={[reason()]} />)
    expect(container.textContent ?? '').not.toMatch(/\d/)
  })

  it('renders nothing rather than inventing a fourth tier', () => {
    // A value that escaped the type system (bad DB row, hand-edited JSON).
    const { container } = render(<FitTierBadge tier={'unrated' as FitTier} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('WhyItFits', () => {
  it('marks matches with + and gaps with ~', () => {
    render(
      <WhyItFits
        reasons={[
          reason({ text: 'Go and distributed systems are both present.' }),
          reason({ text: 'They ask for Kubernetes ops.', gap: true, citations: [] }),
        ]}
      />,
    )

    const block = screen.getByTestId('why-it-fits')
    expect(block.textContent).toContain('+')
    expect(block.textContent).toContain('~')
    expect(block.textContent).toContain('They ask for Kubernetes ops.')
  })

  it('renders every citation as a mono path chip and drops none', () => {
    render(
      <WhyItFits
        reasons={[
          reason({ citations: ['experience[0].bullets[1]', 'skills[0].items[2]'] }),
          reason({ text: 'PostgreSQL throughout.', citations: ['skills[1].items[0]'] }),
        ]}
      />,
    )

    const chips = [...screen.getByTestId('why-it-fits').querySelectorAll('code')]
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'experience[0].bullets[1]',
      'skills[0].items[2]',
      'skills[1].items[0]',
    ])
    expect(chips.every((chip) => chip.className.includes('font-mono'))).toBe(true)
  })

  it('does not dress an unsourced claim up as an evidenced match', () => {
    render(
      <WhyItFits
        reasons={[
          reason({ text: 'Ledger work maps to the role.' }),
          reason({
            text: 'You built the Kafka ingestion pipeline at Stripe.',
            citations: [],
            flag: 'No source — cited experience[3].bullets[2], which your résumé does not have.',
          }),
        ]}
      />,
    )

    const rows = [...screen.getByTestId('why-it-fits').querySelectorAll('li')]
    expect(rows[0].textContent).toContain('+')
    // Three states, three markers: evidenced, unsourced, gap.
    expect(rows[1].textContent).not.toContain('+')
    expect(rows[1].textContent).not.toContain('~')
    expect(screen.getByTestId('fit-reason-flag').textContent).toContain(
      'which your résumé does not have',
    )
  })
})

describe('ResultCard', () => {
  it('renders the listing without ever stating a score', () => {
    const { container } = render(
      <ResultCard result={result()} onPull={vi.fn()} pulling={false} />,
    )

    const card = screen.getByTestId('sourcing-result')
    expect(card.textContent).toContain('Backend Engineer, Payments')
    expect(card.textContent).toContain('Anthropic')
    expect(card.textContent).toContain('Remote (US)')
    expect(card.textContent).toContain('posted 2d ago')
    expect(container.textContent ?? '').not.toMatch(/\d+%/)
  })

  it('keeps the toggle and the pull button inside the card, as the gate scopes them', () => {
    render(<ResultCard result={result()} onPull={vi.fn()} pulling={false} />)

    const card = screen.getByTestId('sourcing-result')
    expect(card.querySelector('[data-testid="why-it-fits-toggle"]')).toBeTruthy()
    expect(card.querySelector('[data-testid="pull-into-pipeline"]')).toBeTruthy()
    expect(card.querySelector('[data-testid="fit-tier-badge"]')).toBeTruthy()
  })

  it('expands Why it fits on the toggle, collapsed until asked', () => {
    render(<ResultCard result={result()} onPull={vi.fn()} pulling={false} />)
    expect(screen.queryByTestId('why-it-fits')).toBeNull()

    const toggle = screen.getByTestId('why-it-fits-toggle')
    fireEvent.click(toggle)
    expect(screen.getByTestId('why-it-fits')).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggle)
    expect(screen.queryByTestId('why-it-fits')).toBeNull()
  })

  it('says nothing at all about fit until the rating lands', () => {
    render(
      <ResultCard result={{ listing: listing() }} onPull={vi.fn()} pulling={false} />,
    )

    expect(screen.queryByTestId('fit-tier-badge')).toBeNull()
    expect(screen.queryByTestId('why-it-fits-toggle')).toBeNull()
    // The pull-in never depends on a rating.
    expect(screen.getByTestId('pull-into-pipeline')).toBeTruthy()
  })

  it('fills the pull button on Strong and outlines it otherwise', () => {
    render(<ResultCard result={result()} onPull={vi.fn()} pulling={false} />)
    expect(screen.getByTestId('pull-into-pipeline').className).toContain('bg-primary')
    cleanup()

    render(
      <ResultCard
        result={result({ rating: rating('reach') })}
        onPull={vi.fn()}
        pulling={false}
      />,
    )
    const button = screen.getByTestId('pull-into-pipeline')
    expect(button.className).not.toContain('bg-primary')
    expect(button.className).toContain('border')
    // Reach recedes rather than disappearing.
    expect(screen.getByTestId('sourcing-result').className).toContain('opacity-[0.82]')
  })

  it('hands the whole result back on pull, and locks the button while it flies', () => {
    const onPull = vi.fn()
    const shown = result()
    const { rerender } = render(
      <ResultCard result={shown} onPull={onPull} pulling={false} />,
    )

    fireEvent.click(screen.getByTestId('pull-into-pipeline'))
    expect(onPull).toHaveBeenCalledWith(shown)

    rerender(<ResultCard result={shown} onPull={onPull} pulling />)
    const button = screen.getByTestId('pull-into-pipeline') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.textContent).toContain('Pulling')
  })
})
