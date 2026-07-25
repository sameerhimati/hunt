import { beforeEach, describe, expect, it, vi } from 'vitest'

import { allCommands, registerCommands, type CommandContext } from '@/lib/commands'

function context() {
  const navigate = vi.fn<(href: string) => void>()
  const toggleTheme = vi.fn<() => void>()
  const ctx: CommandContext = { navigate, close: vi.fn(), toggleTheme }
  return { ctx, navigate, toggleTheme }
}

describe('command registry', () => {
  beforeEach(() => {
    registerCommands('Test area', [])
  })

  it('replaces an area rather than appending, so a re-import cannot duplicate', () => {
    const command = { id: 'test.one', label: 'One', run: () => {} }
    registerCommands('Test area', [command])
    registerCommands('Test area', [command])

    const group = allCommands().find((entry) => entry.area === 'Test area')
    expect(group?.commands).toHaveLength(1)
  })

  it('hides areas that registered nothing', () => {
    expect(allCommands().map((group) => group.area)).not.toContain('Test area')
  })
})

describe('core commands', () => {
  it('registers navigation and the theme toggle out of the box', () => {
    const ids = allCommands().flatMap((group) => group.commands.map((command) => command.id))

    expect(ids).toContain('core.dashboard')
    expect(ids).toContain('core.settings')
    expect(ids).toContain('core.toggle-theme')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only points at screens that exist — later areas register their own', () => {
    const navigate = allCommands().find((group) => group.area === 'Navigate')!

    for (const command of navigate.commands) {
      const { ctx, navigate: spy } = context()
      command.run(ctx)
      expect(['/', '/settings']).toContain(spy.mock.calls[0][0])
    }
  })

  it('routes the theme toggle through the context, not the DOM', () => {
    const toggle = allCommands()
      .flatMap((group) => group.commands)
      .find((command) => command.id === 'core.toggle-theme')!

    const { ctx, toggleTheme } = context()
    toggle.run(ctx)
    expect(toggleTheme).toHaveBeenCalledOnce()
  })
})
