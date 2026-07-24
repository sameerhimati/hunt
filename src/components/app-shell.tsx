import type { ReactNode } from 'react'

import { NavRail } from '@/components/nav-rail'

interface AppShellProps {
  title: string
  /** Right-hand slot on the topbar: the screen's primary action or a summary. */
  action?: ReactNode
  /** Optional second column between the rail and the content (settings sub-nav). */
  aside?: ReactNode
  children: ReactNode
}

export function AppShell({ title, action, aside, children }: AppShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <NavRail />
      {aside}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-border bg-card px-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {action}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
