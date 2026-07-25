import type { ComponentType } from 'react'

/**
 * The ⌘K registry. Areas contribute commands from their own file
 * (`src/lib/commands/<area>.ts`, owned by the phase that builds that area) and
 * the palette renders whatever is registered — so adding commands never means
 * editing the palette, and two phases building in parallel never touch the same
 * file.
 */

export interface CommandContext {
  /** Client-side navigation. */
  navigate: (href: string) => void
  /** Dismisses the palette. Already called before `run`; here for long actions. */
  close: () => void
  /** Flips dark/light and persists the choice. */
  toggleTheme: () => void
}

export interface AppCommand {
  /** Stable, namespaced: `pipeline.new-application`. */
  id: string
  label: string
  /** Extra search terms — users type "kanban" looking for the board. */
  keywords?: string[]
  /** Displayed right-aligned, e.g. `⌘K`. Purely informational. */
  shortcut?: string
  icon?: ComponentType<{ className?: string }>
  run: (context: CommandContext) => void | Promise<void>
}

export interface CommandGroup {
  /** Group heading in the palette, in registration order. */
  area: string
  commands: AppCommand[]
}

const registry = new Map<string, AppCommand[]>()

/**
 * Registers (or replaces) one area's commands. Replace rather than append so a
 * module re-evaluated by HMR or imported twice can't duplicate its entries.
 */
export function registerCommands(area: string, commands: AppCommand[]): void {
  registry.set(area, commands)
}

export function allCommands(): CommandGroup[] {
  return [...registry.entries()]
    .map(([area, commands]) => ({ area, commands }))
    .filter((group) => group.commands.length > 0)
}
