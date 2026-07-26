import { describe, expect, it, vi } from 'vitest'

import { allCommands, type CommandContext } from '@/lib/commands'

describe('sourcing commands', () => {
  const group = allCommands().find((entry) => entry.area === 'Sourcing')

  it('registers the Sourcing area with a search command', () => {
    expect(group).toBeDefined()
    const search = group!.commands.find((command) => command.id === 'sourcing.open')
    expect(search?.label).toBe('Search for jobs')
    expect(search?.keywords).toContain('boards')
    expect(search?.icon).toBeDefined()
  })

  it('navigates to /sourcing', () => {
    const search = group!.commands.find((command) => command.id === 'sourcing.open')!
    const navigate = vi.fn<(href: string) => void>()
    const ctx: CommandContext = { navigate, close: vi.fn(), toggleTheme: vi.fn() }

    search.run(ctx)

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/sourcing')
  })
})
