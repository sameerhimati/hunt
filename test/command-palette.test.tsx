// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandPalette } from '@/components/command-palette'

const push = vi.fn()
const setTheme = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme }) }))

beforeAll(() => {
  // Radix and cmdk reach for APIs jsdom doesn't implement.
  Element.prototype.scrollIntoView = vi.fn()
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  push.mockClear()
  setTheme.mockClear()
})

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

describe('⌘K palette', () => {
  it('opens on the shortcut and runs the selected command', async () => {
    render(<CommandPalette />)
    expect(screen.queryByTestId('command-palette')).toBeNull()

    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    expect(await screen.findByTestId('command-palette')).toBeTruthy()

    fireEvent.click(screen.getByTestId('command-core.settings'))
    expect(push).toHaveBeenCalledWith('/settings')

    // The palette gets out of the way before the action runs.
    await waitFor(() => expect(screen.queryByTestId('command-palette')).toBeNull())
  })

  it('opens from the topbar chip too — the shortcut is not the only way in', async () => {
    render(<CommandPalette />)

    fireEvent.click(screen.getByTestId('command-palette-trigger'))
    expect(await screen.findByTestId('command-palette')).toBeTruthy()
  })

  it('toggles the theme without touching the DOM itself', async () => {
    render(<CommandPalette />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await screen.findByTestId('command-palette')

    fireEvent.click(screen.getByTestId('command-core.toggle-theme'))
    expect(setTheme).toHaveBeenCalledWith('light')
  })
})
