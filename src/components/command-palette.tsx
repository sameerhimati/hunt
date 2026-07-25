'use client'

import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { allCommands, type CommandContext } from '@/lib/commands'

/**
 * ⌘K — a first-class navigation path, not a power-user afterthought
 * (DESIGN.md §5). Mounted once by AppShell: renders the topbar chip and the
 * dialog, so there is a single keyboard listener and a single open state.
 *
 * Commands come from the registry, never from this file — see
 * src/lib/commands/registry.ts.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setOpen((current) => !current)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const context: CommandContext = {
    navigate: (href) => router.push(href),
    close: () => setOpen(false),
    toggleTheme: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
  }

  // Close first: a command that navigates or opens a dialog of its own should
  // never fight the palette for focus.
  const run = (action: (context: CommandContext) => void | Promise<void>) => {
    setOpen(false)
    void action(context)
  }

  const groups = allCommands()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="command-palette-trigger"
        aria-label="Open command palette"
        className="rounded-[7px] border border-border px-2.5 py-1.5 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:border-faint hover:text-foreground"
      >
        ⌘K
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command palette"
        description="Jump to a screen or run an action"
      >
        <CommandInput placeholder="Search commands…" data-testid="command-palette-input" />
        <CommandList data-testid="command-palette">
          <CommandEmpty>No matching command.</CommandEmpty>

          {groups.map(({ area, commands }) => (
            <CommandGroup key={area} heading={area}>
              {commands.map((command) => {
                const Icon = command.icon
                return (
                  <CommandItem
                    key={command.id}
                    value={[command.label, ...(command.keywords ?? [])].join(' ')}
                    onSelect={() => run(command.run)}
                    data-testid={`command-${command.id}`}
                  >
                    {Icon ? <Icon className="size-4" /> : null}
                    <span>{command.label}</span>
                    {command.shortcut ? (
                      <CommandShortcut>{command.shortcut}</CommandShortcut>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
