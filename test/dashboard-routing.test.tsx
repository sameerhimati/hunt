// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FunnelStats } from '@/lib/pipeline/stats'
import type { ProviderState } from '@/lib/providers/status'

/**
 * The dashboard is one route with three faces, and this pins which face each
 * state gets. Everything it reads is stubbed — the point is the routing and the
 * copy, not Prisma.
 */
const funnelStats = vi.hoisted(() => vi.fn<() => Promise<FunnelStats>>())
const recentActivity = vi.hoisted(() => vi.fn(async () => []))
const readAllProviderStates = vi.hoisted(() => vi.fn<() => Promise<ProviderState[]>>())
const countResumes = vi.hoisted(() => vi.fn<() => Promise<number>>())

vi.mock('@/lib/pipeline/stats', () => ({ funnelStats, recentActivity }))
vi.mock('@/lib/providers/status', () => ({ readAllProviderStates }))
vi.mock('@/lib/resume/store', () => ({ countResumes }))
// Both are real screens of their own with their own I/O; the dashboard only
// slots them in.
vi.mock('@/components/dashboard/follow-ups', () => ({ FollowUpsPanel: () => null }))
vi.mock('@/components/pipeline/new-application-dialog', () => ({
  NewApplicationDialog: () => null,
}))
// The shell contributes the nav rail's links to the document; stubbing it keeps
// every href in these assertions one the dashboard itself chose to offer.
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const Home = (await import('@/app/page')).default

afterEach(cleanup)

function stats(total: number): FunnelStats {
  return {
    byStatus: {
      sourced: total,
      tailored: 0,
      applied: 0,
      outreach: 0,
      replied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
    },
    total,
    reached: [{ label: 'In pipeline', count: total }],
    conversions: [],
  }
}

/** What a fresh install reports: `free_boards` is live and needs no key. */
function freeBoardsOnly(): ProviderState[] {
  return [
    { id: 'anthropic', ship: 'live', status: 'not-set', fields: [] },
    { id: 'free_boards', ship: 'live', status: 'configured', fields: [] },
  ]
}

async function renderDashboard() {
  render(await Home())
}

function hrefs(): string[] {
  return [...document.querySelectorAll('a')].map((link) => link.getAttribute('href') ?? '')
}

describe('dashboard routing', () => {
  it('sends a user with no résumé to the résumé, not to the funnel', async () => {
    funnelStats.mockResolvedValue(stats(1))
    readAllProviderStates.mockResolvedValue(freeBoardsOnly())
    countResumes.mockResolvedValue(0)

    await renderDashboard()

    expect(screen.getByText('Start with your résumé')).toBeTruthy()
    // The résumé is the primary exit; Settings stays on offer, second.
    expect(hrefs()).toEqual(['/resumes', '/settings'])
    // One application is not a search worth measuring, and the funnel it drew
    // was five zeros.
    expect(screen.queryByTestId('funnel-stats')).toBeNull()
  })

  it('sends a user with a résumé and no applications to a first job', async () => {
    funnelStats.mockResolvedValue(stats(0))
    readAllProviderStates.mockResolvedValue(freeBoardsOnly())
    countResumes.mockResolvedValue(1)

    await renderDashboard()

    expect(screen.getByText('Nothing in your sights yet')).toBeTruthy()
    expect(hrefs()).toContain('/pipeline')
    expect(hrefs()).toContain('/sourcing')
    expect(screen.queryByTestId('funnel-stats')).toBeNull()
  })

  it('draws the dashboard once there is a résumé and a search to measure', async () => {
    funnelStats.mockResolvedValue(stats(3))
    readAllProviderStates.mockResolvedValue(freeBoardsOnly())
    countResumes.mockResolvedValue(1)

    await renderDashboard()

    expect(screen.getByTestId('funnel-stats')).toBeTruthy()
    expect(screen.queryByText('Start with your résumé')).toBeNull()
  })
})

describe('the keyless floor', () => {
  it('never counts a provider that needs no key as a key the user set', async () => {
    funnelStats.mockResolvedValue(stats(3))
    readAllProviderStates.mockResolvedValue(freeBoardsOnly())
    countResumes.mockResolvedValue(1)

    await renderDashboard()

    expect(document.body.textContent).toContain('no keys set')
    expect(document.body.textContent).not.toMatch(/1 (key|provider)/)
  })

  it('counts a provider that does need one', async () => {
    funnelStats.mockResolvedValue(stats(3))
    readAllProviderStates.mockResolvedValue([
      ...freeBoardsOnly().filter((state) => state.id !== 'anthropic'),
      { id: 'anthropic', ship: 'live', status: 'configured', fields: [] },
    ])
    countResumes.mockResolvedValue(1)

    await renderDashboard()

    expect(document.body.textContent).toContain('1 key set')
  })

  it('tells a keyless user what already works instead of gating them on keys', async () => {
    funnelStats.mockResolvedValue(stats(0))
    readAllProviderStates.mockResolvedValue(freeBoardsOnly())
    countResumes.mockResolvedValue(0)

    await renderDashboard()

    const body = document.body.textContent ?? ''
    expect(body).toMatch(/no keys set, and none are needed/i)
    // Keys are offered, never demanded: Settings is reachable but it is the
    // second action, and there is no face of its own telling the user to stop
    // and configure something.
    expect(hrefs()).toContain('/settings')
    expect(hrefs()[0]).toBe('/resumes')
    expect(screen.queryByText(/add a key|add your keys/i)).toBeNull()
  })
})
