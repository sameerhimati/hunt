// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { SavedSearches } from '@/components/sourcing/saved-searches'
import { SearchBar } from '@/components/sourcing/search-bar'
import type { JobQuery, SavedSearch } from '@/lib/sourcing/types'

beforeAll(() => {
  // Radix reaches for APIs jsdom doesn't implement.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

const query = (overrides: Partial<JobQuery> = {}): JobQuery => ({
  keywords: 'backend',
  ...overrides,
})

const saved = (overrides: Partial<SavedSearch> = {}): SavedSearch => ({
  id: 's1',
  label: 'platform',
  query: { keywords: 'platform' },
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('search bar', () => {
  it('edits keywords, location and the remote toggle through onChange', () => {
    const onChange = vi.fn()
    render(
      <SearchBar value={query()} onChange={onChange} onSearch={vi.fn()} searching={false} />,
    )

    fireEvent.change(screen.getByTestId('search-keywords'), { target: { value: 'platform' } })
    expect(onChange).toHaveBeenLastCalledWith({ keywords: 'platform' })

    fireEvent.change(screen.getByTestId('search-location'), { target: { value: 'SF' } })
    expect(onChange).toHaveBeenLastCalledWith({ keywords: 'backend', location: 'SF' })

    fireEvent.click(screen.getByTestId('search-remote'))
    expect(onChange).toHaveBeenLastCalledWith({ keywords: 'backend', remoteOnly: true })
  })

  it('submits on Enter from either field and on the button', () => {
    const onSearch = vi.fn()
    render(<SearchBar value={query()} onChange={vi.fn()} onSearch={onSearch} searching={false} />)

    fireEvent.keyDown(screen.getByTestId('search-keywords'), { key: 'Enter' })
    fireEvent.keyDown(screen.getByTestId('search-location'), { key: 'Enter' })
    fireEvent.click(screen.getByTestId('search-jobs'))
    expect(onSearch).toHaveBeenCalledTimes(3)
  })

  it('says it is searching and keeps the fields editable while it is', () => {
    const onChange = vi.fn()
    const onSearch = vi.fn()
    render(<SearchBar value={query()} onChange={onChange} onSearch={onSearch} searching />)

    const button = screen.getByTestId('search-jobs') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.textContent).toMatch(/searching/i)

    const keywords = screen.getByTestId('search-keywords') as HTMLInputElement
    expect(keywords.disabled).toBe(false)
    fireEvent.change(keywords, { target: { value: 'backend platform' } })
    expect(onChange).toHaveBeenCalledWith({ keywords: 'backend platform' })

    // …but Enter doesn't fire a second search on top of the one in flight.
    fireEvent.keyDown(keywords, { key: 'Enter' })
    expect(onSearch).not.toHaveBeenCalled()
  })
})

describe('saved searches', () => {
  it('labels each chip with its query and re-runs it on click', () => {
    const onRun = vi.fn()
    render(
      <SavedSearches
        saved={[saved(), saved({ id: 's2', query: { keywords: 'infra', remoteOnly: true } })]}
        activeId={null}
        onRun={onRun}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const chips = screen.getAllByTestId('saved-search-chip')
    expect(chips.map((chip) => chip.textContent)).toEqual(['platform', 'infra · remote'])

    fireEvent.click(chips[0])
    expect(onRun).toHaveBeenCalledWith('s1')
  })

  it('marks the active chip', () => {
    render(
      <SavedSearches
        saved={[saved(), saved({ id: 's2', query: { keywords: 'infra' } })]}
        activeId="s2"
        onRun={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const chips = screen.getAllByTestId('saved-search-chip')
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(chips[1].className).toContain('border-primary')
  })

  it('deletes without a confirm step', () => {
    const onDelete = vi.fn()
    render(
      <SavedSearches
        saved={[saved()]}
        activeId={null}
        onRun={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByTestId('delete-saved-search'))
    expect(onDelete).toHaveBeenCalledWith('s1')
  })

  it('only offers to save a query that is neither empty nor already saved', () => {
    const onSave = vi.fn()
    const chip = () => screen.getByTestId('save-search') as HTMLButtonElement

    const { rerender } = render(
      <SavedSearches
        saved={[saved()]}
        activeId={null}
        onRun={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        query={{ keywords: '  ' }}
      />,
    )
    expect(chip().disabled).toBe(true)

    rerender(
      <SavedSearches
        saved={[saved()]}
        activeId={null}
        onRun={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        query={{ keywords: 'platform' }}
      />,
    )
    expect(chip().disabled).toBe(true)

    rerender(
      <SavedSearches
        saved={[saved()]}
        activeId={null}
        onRun={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        query={{ keywords: 'backend', remoteOnly: true }}
      />,
    )
    expect(chip().disabled).toBe(false)
    fireEvent.click(chip())
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('leaves the save chip live when no query is passed', () => {
    render(
      <SavedSearches
        saved={[saved()]}
        activeId={null}
        onRun={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect((screen.getByTestId('save-search') as HTMLButtonElement).disabled).toBe(false)
  })
})
