import type { ComponentType, ReactNode } from 'react'

import { HuntMark } from '@/components/hunt-mark'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** One serif line. hunt-metaphor copy is allowed here and nowhere else. */
  title: string
  /** One sentence of what and why. */
  body: string
  icon?: ComponentType<{ size?: number; className?: string }>
  /** One or two actions. Never zero — an empty state without an exit is a dead end. */
  action?: ReactNode
  className?: string
}

/** The zero-data pattern, identical on every screen (SCREENS §11). */
export function EmptyState({ title, body, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex h-full items-center justify-center px-6 py-16', className)}>
      <div className="max-w-md text-center">
        {Icon ? (
          <Icon size={26} className="mx-auto text-faint" />
        ) : (
          <HuntMark size={28} className="mx-auto text-primary" />
        )}

        <h2 className="mt-4 font-serif text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>

        {action ? <div className="mt-5 flex items-center justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  )
}
