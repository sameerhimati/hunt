'use client'

import { useFormStatus } from 'react-dom'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The client half of the dashboard's follow-up row.
 *
 * It exists for one reason: the panel is a Server Component, and a Server
 * Component cannot hold the state that stops a second click. Before hydration
 * a bare `<form action={fn}>` is a native POST, so two clicks were two sends
 * with certainty — and a send is irreversible.
 *
 * `useFormStatus` has to read the status of the form *above* it, so this is a
 * separate component rather than a `disabled` prop on the button in the panel
 * (Next docs, `01-app/02-guides/forms.md`). It is the second line of defence:
 * the first is `sendStep` claiming the row before it touches the wire.
 */
export function SubmitButton({
  label,
  pendingLabel,
  testId,
  variant = 'default',
}: {
  label: string
  /** What the button says while the action is in flight — never the same word. */
  pendingLabel: string
  testId: string
  variant?: 'default' | 'outline' | 'ghost'
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(buttonVariants({ variant, size: 'sm' }), 'text-xs')}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
