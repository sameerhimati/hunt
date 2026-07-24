import * as React from 'react'

import { cn } from '@/lib/utils'

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-9 w-full rounded-md border border-border bg-background px-3 text-base text-foreground',
        'placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-50',
        // Keys and identifiers are data — they read as mono everywhere in hunt.
        'font-mono text-sm',
        className,
      )}
      {...props}
    />
  )
}
