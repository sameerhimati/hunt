// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChangeInspector } from '@/components/tailor/change-inspector'
import { FabricationFlag } from '@/components/tailor/fabrication-flag'
import type { TailorChange } from '@/lib/tailor/types'

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

const proposed: TailorChange = {
  id: 'c1',
  kind: 'edit',
  path: 'experience[0].bullets[3]',
  was: 'Improved database performance by sharding the ledger service.',
  now: 'Cut p99 latency 38% by sharding the ledger service.',
  why: 'JD leads with reliability & latency SLOs; your original buried the metric.',
  citation: {
    path: 'experience[0].bullets[3]',
    snippet: 'reduced p99 from 210ms to 130ms after sharding',
  },
  status: 'proposed',
}

const refused: TailorChange = {
  id: 'c2',
  kind: 'add',
  path: 'experience[0].bullets',
  now: 'Led a 12-person team across two orgs.',
  why: 'The JD asks for leadership scope.',
  citation: null,
  status: 'refused',
  refusedReason: 'No citation given.',
}

function renderInspector(props: Partial<React.ComponentProps<typeof ChangeInspector>> = {}) {
  const onAccept = vi.fn()
  const onReject = vi.fn()
  render(
    <ChangeInspector
      change={proposed}
      decision="pending"
      onAccept={onAccept}
      onReject={onReject}
      {...props}
    />,
  )
  return { onAccept, onReject }
}

describe('ChangeInspector (TAILORING-DIFF §4)', () => {
  it('shows was → now → why → citation, and the WHY label the gate looks for', () => {
    renderInspector()

    const panel = screen.getByTestId('change-inspector')
    expect(panel.textContent).toMatch(/WHY/i)
    expect(panel.textContent).toContain(proposed.why)
    expect(screen.getByTestId('inspector-was').textContent).toBe(proposed.was)
    expect(screen.getByTestId('inspector-now').textContent).toBe(proposed.now)
    expect(screen.getByTestId('citation-chip').textContent).toContain('experience[0]')
    expect(panel.textContent).toContain('reduced p99 from 210ms to 130ms after sharding')
  })

  it('omits the "was" line for an addition, which replaces nothing', () => {
    renderInspector({ change: { ...proposed, kind: 'add', was: null } })
    expect(screen.queryByTestId('inspector-was')).toBeNull()
  })

  it('accepts and rejects through the testids the gate drives', () => {
    const { onAccept, onReject } = renderInspector()

    fireEvent.click(screen.getByTestId('accept-change'))
    fireEvent.click(screen.getByTestId('reject-change'))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('reads "Kept" once the change is accepted', () => {
    renderInspector({ decision: 'accepted' })
    expect(screen.getByTestId('accept-change').textContent).toBe('Kept')
  })

  it('sends the citation path to the Structured tab when the chip is clicked', () => {
    const onCite = vi.fn()
    renderInspector({ onCite })

    fireEvent.click(screen.getByTestId('citation-chip'))
    expect(onCite).toHaveBeenCalledWith('experience[0].bullets[3]')
  })

  it('walks changes with prev/next when the shell wires them, mirroring j/k', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderInspector({ onPrev, onNext })

    fireEvent.click(screen.getByTestId('inspector-prev'))
    fireEvent.click(screen.getByTestId('inspector-next'))
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('names the keys instead of rendering dead buttons when prev/next are unwired', () => {
    renderInspector()

    expect(screen.queryByTestId('inspector-prev')).toBeNull()
    expect(screen.getByTestId('change-inspector').textContent).toMatch(/j \/ k/)
  })

  it('docks the section’s refusals at the bottom and never as a diff row', () => {
    renderInspector({ refusedInSection: [refused] })

    const flag = screen.getByTestId('fabrication-flag')
    expect(flag.textContent).toMatch(/no source/i)
    expect(flag.getAttribute('data-testid')).not.toBe('diff-row')
    expect(screen.queryByTestId('diff-row')).toBeNull()
  })

  it('never docks the selected change against itself', () => {
    renderInspector({ change: refused, refusedInSection: [refused] })
    expect(screen.queryByTestId('fabrication-flag')).toBeNull()
  })

  it('routes a docked refusal’s escape hatch to its own field in the Structured tab', () => {
    const onCite = vi.fn()
    renderInspector({ refusedInSection: [refused], onCite })

    fireEvent.click(screen.getByTestId('add-it-yourself'))
    expect(onCite).toHaveBeenCalledWith('experience[0].bullets')
  })
})

describe('FabricationFlag (TAILORING-DIFF §5)', () => {
  it('strikes the proposed sentence through and states the fact, verbatim', () => {
    render(<FabricationFlag change={refused} />)

    const flag = screen.getByTestId('fabrication-flag')
    const struck = flag.querySelector('.line-through')
    expect(struck?.textContent).toBe(refused.now)
    expect(flag.textContent).toContain('Not added — no source.')
    expect(flag.textContent).toContain(
      'The model proposed this; nothing in your résumé supports it. hunt won’t invent experience.',
    )
  })

  it('keeps the product copy even when the validator supplies a reason', () => {
    render(<FabricationFlag change={{ ...refused, refusedReason: 'Cited path does not resolve.' }} />)

    const flag = screen.getByTestId('fabrication-flag')
    expect(flag.textContent).toMatch(/no source/i)
    expect(screen.getByTestId('fabrication-reason').textContent).toBe('Cited path does not resolve.')
  })

  it('never lectures — no "dishonest", no warning, no block', () => {
    render(<FabricationFlag change={refused} onDismiss={vi.fn()} onAddYourself={vi.fn()} />)

    const text = screen.getByTestId('fabrication-flag').textContent ?? ''
    expect(text).not.toMatch(/dishonest|lying|cheat|warning/i)
  })

  it('dismisses and offers the escape hatch when both are wired', () => {
    const onDismiss = vi.fn()
    const onAddYourself = vi.fn()
    render(<FabricationFlag change={refused} onDismiss={onDismiss} onAddYourself={onAddYourself} />)

    fireEvent.click(screen.getByTestId('dismiss-fabrication'))
    fireEvent.click(screen.getByTestId('add-it-yourself'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onAddYourself).toHaveBeenCalledTimes(1)
  })

  it('hides unwired actions rather than showing buttons that do nothing', () => {
    render(<FabricationFlag change={refused} />)

    expect(screen.queryByTestId('dismiss-fabrication')).toBeNull()
    expect(screen.queryByTestId('add-it-yourself')).toBeNull()
  })
})
