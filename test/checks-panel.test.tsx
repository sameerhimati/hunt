// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChecksResult, ChecksSnapshot } from '@/app/applications/[id]/checks-actions'
import type { CheckOutcome } from '@/lib/checks/types'

// The panel talks to the server through two actions and to the router through
// `useParams`. Both are stubbed so this suite tests the panel in isolation —
// the actions have their own coverage against the real database.
const loadChecksAction = vi.fn<(id: string) => Promise<ChecksResult>>()
const runChecksAction = vi.fn<(id: string) => Promise<ChecksResult>>()

vi.mock('@/app/applications/[id]/checks-actions', () => ({
  loadChecksAction: (id: string) => loadChecksAction(id),
  runChecksAction: (id: string) => runChecksAction(id),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'app-1' }),
}))

const { ChecksPanel } = await import('@/components/application/checks-panel')
const { MatchRatingCard } = await import('@/components/application/match-rating-card')

const VERSION = { id: 'v2', resumeId: 'r1', label: 'v2 · Stripe' }

const OUTCOMES: CheckOutcome[] = [
  {
    kind: 'parse_fidelity',
    verdict: 'warn',
    summary: '2 of 14 fields dropped',
    details: { dropped: ['basics.url', 'experience[1].start'], checked: 14, verdict: 'warn' },
  },
  {
    kind: 'keyword_coverage',
    verdict: 'warn',
    summary: '18 / 22 JD terms',
    details: {
      terms: ['Go', 'gRPC', 'latency'],
      matched: ['Go', 'gRPC'],
      missing: ['latency'],
    },
  },
  { kind: 'format_lint', verdict: 'pass', summary: 'clean', details: { issues: [] } },
  {
    kind: 'ai_tell',
    verdict: 'warn',
    summary: '1 phrase flagged',
    details: {
      flags: [
        {
          path: 'experience[0].bullets[2]',
          phrase: 'leveraged',
          suggestion: 'Say “used”.',
        },
      ],
    },
  },
  {
    kind: 'match_rating',
    verdict: 'pass',
    summary: 'Strong — 2 reasons',
    details: {
      tier: 'strong',
      reasons: [
        { text: 'Owns a payments ledger in Go.', citations: ['experience[0].bullets[0]'], gap: false },
        { text: 'No Kubernetes anywhere on the page.', citations: [], gap: true },
      ],
    },
  },
]

function snapshot(outcomes: CheckOutcome[]): ChecksSnapshot {
  return { version: VERSION, hasJd: true, outcomes, ranAt: '2026-07-25T00:00:00.000Z' }
}

beforeEach(() => {
  loadChecksAction.mockReset()
  runChecksAction.mockReset()
  loadChecksAction.mockResolvedValue({ ok: true, snapshot: snapshot([]) })
  runChecksAction.mockResolvedValue({ ok: true, snapshot: snapshot(OUTCOMES) })
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

describe('ChecksPanel — the gate contract (SCREENS §7)', () => {
  it('renders exactly four check cards before anything has been measured', () => {
    render(<ChecksPanel />)

    // Not-run state, no awaiting: the count assertion can never race a slow check.
    expect(screen.getAllByTestId('check-card')).toHaveLength(4)
    expect(screen.getByTestId('run-checks')).toBeTruthy()
    expect(screen.getByTestId('checks-panel').textContent).toMatch(/no fake ATS score/i)
  })

  it('still renders exactly four after a run — the match rating is not a check card', async () => {
    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    await waitFor(() => expect(screen.getByText('18 / 22 JD terms')).toBeTruthy())

    expect(screen.getAllByTestId('check-card')).toHaveLength(4)
    const rating = screen.getByTestId('match-rating')
    expect(rating.getAttribute('data-testid')).toBe('match-rating')
    expect(rating.querySelector('[data-testid="check-card"]')).toBeNull()
  })

  it('names the four instruments and never prints a score out of 100', async () => {
    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    await waitFor(() => expect(screen.getByText('clean')).toBeTruthy())

    const text = screen.getByTestId('checks-panel').textContent ?? ''
    for (const name of ['Parse fidelity', 'Keyword coverage', 'Format lint', 'AI-tell audit']) {
      expect(text).toContain(name)
    }
    expect(text).not.toMatch(/\d+\s*\/\s*100/)
  })

  it('shows the counts the design calls for, in order', async () => {
    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    await waitFor(() => expect(screen.getAllByTestId('check-count')).toHaveLength(4))
    expect(screen.getAllByTestId('check-count').map((node) => node.textContent)).toEqual([
      '2 of 14 fields dropped',
      '18 / 22 JD terms',
      'clean',
      '1 phrase flagged',
    ])
  })
})

describe('ChecksPanel — states', () => {
  it('hydrates from the last saved run without the user clicking anything', async () => {
    loadChecksAction.mockResolvedValue({ ok: true, snapshot: snapshot(OUTCOMES) })
    render(<ChecksPanel />)

    await waitFor(() => expect(screen.getByText('1 phrase flagged')).toBeTruthy())
    expect(runChecksAction).not.toHaveBeenCalled()
  })

  it('expands parse fidelity by default and links the dropped fields to the exact field', async () => {
    loadChecksAction.mockResolvedValue({ ok: true, snapshot: snapshot(OUTCOMES) })
    render(<ChecksPanel />)

    await waitFor(() => expect(screen.getAllByTestId('check-specifics')).toHaveLength(1))

    const links = screen.getAllByTestId('check-fix-link')
    expect(links[0].getAttribute('href')).toBe('/resumes/r1#field-basics-url')
    expect(links[1].getAttribute('href')).toBe('/resumes/r1#field-experience-1-start')
  })

  it('swaps every count for a skeleton while a sweep is in flight', async () => {
    let release: (result: ChecksResult) => void = () => {}
    runChecksAction.mockReturnValue(
      new Promise<ChecksResult>((resolve) => {
        release = resolve
      }),
    )

    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    expect(screen.getAllByTestId('check-skeleton')).toHaveLength(4)
    expect(screen.getAllByTestId('check-card')).toHaveLength(4)

    release({ ok: true, snapshot: snapshot(OUTCOMES) })
    await waitFor(() => expect(screen.queryAllByTestId('check-skeleton')).toHaveLength(0))
  })

  it('degrades a single failed check to its own warn card carrying the reason', async () => {
    const degraded: CheckOutcome[] = OUTCOMES.map((outcome) =>
      outcome.kind === 'parse_fidelity'
        ? {
            kind: 'parse_fidelity',
            verdict: 'warn',
            summary: 'Not measured',
            details: {},
            error: 'The PDF engine is still downloading.',
          }
        : outcome,
    )
    runChecksAction.mockResolvedValue({ ok: true, snapshot: snapshot(degraded) })

    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    await waitFor(() => expect(screen.getByText('Not measured')).toBeTruthy())
    // The other three still report their counts — one instrument, one card.
    expect(screen.getAllByTestId('check-card')).toHaveLength(4)
    expect(screen.getByText('The PDF engine is still downloading.')).toBeTruthy()
    expect(screen.getByText('clean')).toBeTruthy()
  })

  it('surfaces the real reason when the run itself cannot start', async () => {
    runChecksAction.mockResolvedValue({ ok: false, error: 'No résumé version is pinned yet.' })

    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    await waitFor(() =>
      expect(screen.getByTestId('checks-error').textContent).toContain('No résumé version'),
    )
    expect(screen.getAllByTestId('check-card')).toHaveLength(4)
  })

  it('runs the sweep from a per-check Run control', async () => {
    render(<ChecksPanel />)
    await waitFor(() => expect(screen.getByTestId('run-check-format_lint')).toBeTruthy())
    fireEvent.click(screen.getByTestId('run-check-format_lint'))

    await waitFor(() => expect(runChecksAction).toHaveBeenCalledWith('app-1'))
  })
})

/**
 * The actions return a result union rather than throwing, but the *call* is
 * still an RPC: a dropped connection or a 500 rejects the promise instead. Left
 * unhandled that stranded the panel — "Running…" forever, five skeletons, and
 * `error` still null so nothing on screen explained it.
 */
describe('ChecksPanel — when the call itself fails', () => {
  it('releases the button and says why when a sweep never reaches the server', async () => {
    runChecksAction.mockRejectedValue(new Error('Failed to fetch'))

    render(<ChecksPanel />)
    fireEvent.click(screen.getByTestId('run-checks'))

    await waitFor(() => expect(screen.getByTestId('checks-error')).toBeTruthy())
    expect(screen.getByTestId('checks-error').textContent).toContain('Failed to fetch')

    // The panel has to come back: a stuck "Running…" only clears on a reload.
    expect(screen.getByTestId('run-checks').textContent).not.toMatch(/Running/)
    expect(screen.getByTestId('run-checks').hasAttribute('disabled')).toBe(false)
    await waitFor(() => expect(screen.queryAllByTestId('check-skeleton')).toHaveLength(0))
  })

  it('says the readings could not be read rather than failing silently', async () => {
    loadChecksAction.mockRejectedValue(new Error('Failed to fetch'))

    render(<ChecksPanel />)

    // The silent version of this bug reads "Nothing measured yet" forever for
    // an application that has stored readings.
    await waitFor(() => expect(screen.getByTestId('checks-error')).toBeTruthy())
    expect(screen.getByTestId('checks-error').textContent).toContain('Failed to fetch')
  })
})

describe('ChecksPanel — first paint', () => {
  it('claims nothing about the data until the load answers', async () => {
    let release: (result: ChecksResult) => void = () => {}
    loadChecksAction.mockReturnValue(
      new Promise<ChecksResult>((resolve) => {
        release = resolve
      }),
    )

    render(<ChecksPanel />)

    // Both of these are positive claims about the user's data, and at this
    // point the panel has not read a single row.
    const text = () => screen.getByTestId('checks-panel').textContent ?? ''
    expect(text()).not.toMatch(/Nothing measured yet/i)
    expect(text()).not.toMatch(/no résumé pinned yet/i)
    expect(screen.getAllByTestId('check-skeleton')).toHaveLength(4)

    release({ ok: true, snapshot: snapshot([]) })

    // Once it has looked, it is allowed to say so.
    await waitFor(() => expect(text()).toMatch(/Nothing measured yet/i))
  })
})

describe('MatchRatingCard', () => {
  const rating = OUTCOMES[4]

  it('shows the tier and its cited reasons, never a number', () => {
    render(<MatchRatingCard outcome={rating} resumeId="r1" onRun={() => {}} />)

    expect(screen.getByTestId('fit-tier').textContent).toBe('Strong fit')
    fireEvent.click(screen.getByRole('button', { name: /Match rating/ }))

    expect(screen.getAllByTestId('fit-reason')).toHaveLength(2)
    expect(screen.getByTestId('fit-citation').getAttribute('href')).toBe(
      '/resumes/r1#field-experience-0-bullets-0-',
    )
    expect(screen.getByTestId('match-rating').textContent).not.toMatch(/\d+\s*%|\d+\s*\/\s*\d+/)
  })

  it('shows the key-missing state with a route to fix it', () => {
    render(
      <MatchRatingCard
        outcome={{
          kind: 'match_rating',
          verdict: 'warn',
          summary: 'Not measured — no model configured',
          details: null,
          error: 'Fit rating needs a language model. Add an Anthropic key in Settings.',
        }}
        onRun={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Match rating/ }))
    expect(screen.getByTestId('match-rating-settings-link').getAttribute('href')).toBe(
      '/settings#section-llm',
    )
    expect(screen.getByTestId('match-rating-specifics').textContent).toMatch(
      /other four checks above/i,
    )
  })
})
