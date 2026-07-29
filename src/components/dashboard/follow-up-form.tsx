'use client'

import Link from 'next/link'
import { useActionState } from 'react'
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
/** What `dispatch` hands back. `error` is the adapter's own words, verbatim. */
export interface FollowUpResult {
  error?: string
}

export type FollowUpAction = (
  state: FollowUpResult,
  formData: FormData,
) => Promise<FollowUpResult>

/**
 * One action on one due row: the form, its button's pending state, and the
 * reason it failed if it did.
 *
 * The reason is rendered here rather than carried to `/outreach?error=…`
 * because it is the adapter's own message — nodemailer embeds the host, port
 * and username of a failed SMTP handshake in it, and a query string lands in
 * browser history, in the `Referer` header of every subsequent request, and in
 * whatever access log sits in front of the app. `useActionState` keeps it in
 * memory on the row that produced it, next to the button the user pressed.
 */
export function FollowUpForm({
  action,
  stepId,
  applicationId,
  mode,
  label,
  pendingLabel,
  testId,
  variant,
}: {
  action: FollowUpAction
  stepId: string
  applicationId: string
  /** `manual` records a message the user sent from their own client. */
  mode?: 'manual'
  label: string
  pendingLabel: string
  testId: string
  variant?: 'default' | 'outline' | 'ghost'
}) {
  const [state, formAction] = useActionState<FollowUpResult, FormData>(action, {})

  return (
    <div className="flex min-w-0 shrink-0 flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="step" value={stepId} />
        <input type="hidden" name="application" value={applicationId} />
        {mode ? <input type="hidden" name="mode" value={mode} /> : null}
        <SubmitButton
          label={label}
          pendingLabel={pendingLabel}
          testId={testId}
          variant={variant}
        />
      </form>

      {state.error ? (
        <p
          data-testid="follow-up-error"
          role="alert"
          className="max-w-[260px] text-right text-xs leading-relaxed text-destructive"
        >
          {state.error}{' '}
          <Link
            href={`/outreach?application=${applicationId}`}
            className="whitespace-nowrap underline underline-offset-4"
          >
            Open in composer
          </Link>
        </p>
      ) : null}
    </div>
  )
}

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
