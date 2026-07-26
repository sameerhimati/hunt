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

describe('tailoring commands (Phase 3)', () => {
  it('registers "Start a tailor run" and "Run checks on this application" commands', () => {
    const ids = allCommands().flatMap((group) => group.commands.map((command) => command.id))

    expect(ids).toContain('tailor.start-run')
    expect(ids).toContain('tailor.run-checks')
  })

  it('includes tailoring in the command groups', () => {
    const areas = allCommands().map((group) => group.area)
    expect(areas).toContain('Tailoring')
  })

  it('tailor commands have unique ids', () => {
    const ids = allCommands().flatMap((group) => group.commands.map((command) => command.id))
    expect(new Set(ids).size).toBe(ids.length)
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
