import { revalidatePath } from 'next/cache'
import Link from 'next/link'

import { FollowUpForm, type FollowUpResult } from '@/components/dashboard/follow-up-form'
import { buttonVariants } from '@/components/ui/button'
import { createAdapter } from '@/lib/adapters/factory'
import { followUpsDue, type FollowUpRow } from '@/lib/outreach/queue'
import { markSentManually, sendStep } from '@/lib/outreach/send'
import { cn } from '@/lib/utils'

/**
 * The dashboard's *Follow-ups due today* panel (`design/Dashboard.dc.html`) —
 * the action queue the closed loop pays off into.
 *
 * Three rules it lives by:
 *
 * 1. **The count is a count.** `followUpsDue()` walks the same `dueSteps`
 *    schedule the Outreach screen's "Due today" group does, so the number in
 *    the header cannot drift from the screen the rows link into.
 * 2. **Zero-cost when there is nothing to do.** `followUpsDue` returns early on
 *    an empty table, and the "can hunt send?" probe — which reads the encrypted
 *    settings — only runs when there is a row that would use it.
 * 3. **No email key is a product state, not a dead button.** Without a provider
 *    the row offers Draft / Copy / Mark sent and says why (SCREENS §2), instead
 *    of a greyed-out Send with no explanation.
 *
 * The mutation is an inline Server Function (Next docs,
 * `01-app/01-getting-started/07-mutating-data.md`: `'use server'` at the top of
 * an async function declared inside a Server Component), so this panel owns its
 * own action instead of reaching for a shared actions file.
 */

/** Can hunt actually put mail on the wire? The same two providers the send path tries. */
async function emailConfigured(): Promise<boolean> {
  const [resend, smtp] = await Promise.all([createAdapter('resend'), createAdapter('smtp')])
  return Boolean(resend ?? smtp)
}

/** The three surfaces that count outreach. Leaving one stale shows two answers. */
function revalidate(applicationId: string): void {
  revalidatePath('/')
  revalidatePath('/outreach')
  if (applicationId) revalidatePath(`/applications/${applicationId}`)
}

/**
 * `sendStep` claimed the row and never learned what the provider did with it.
 * Saying "sent" or "not sent" would both be guesses.
 */
const UNCONFIRMED =
  'hunt could not confirm this one — it may already have reached them. Check your sent mail.'

export async function FollowUpsPanel() {
  const due = await followUpsDue()

  /**
   * Send one due step, or record one the user sent from their own client.
   *
   * A failure is not an error page and not a redirect: it comes back as state
   * the row renders in place. The reason is the adapter's own message — which
   * for an SMTP handshake carries host, port and username — so it must not
   * travel in a query string, where browser history, the `Referer` header and
   * every access log in the path would keep a copy.
   *
   * Every path revalidates, failures included: `sendStep` claims the row before
   * it touches the network, so even a send that threw may have changed what the
   * panel should show.
   */
  async function dispatch(_state: FollowUpResult, formData: FormData): Promise<FollowUpResult> {
    'use server'
    const id = String(formData.get('step') ?? '')
    const applicationId = String(formData.get('application') ?? '')
    if (!id) return { error: 'That step is no longer here. Reload the page.' }

    let outcome: string | undefined
    try {
      if (formData.get('mode') === 'manual') await markSentManually(id)
      else ({ outcome } = await sendStep(id))
    } catch (error) {
      revalidate(applicationId)
      return { error: error instanceof Error ? error.message : 'The send failed.' }
    }

    revalidate(applicationId)
    return outcome === 'unconfirmed' ? { error: UNCONFIRMED } : {}
  }

  // Only ask once, and only when a row would use the answer.
  const canSend = due.length > 0 ? await emailConfigured() : false

  return (
    <section
      data-testid="follow-ups"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-base font-semibold">Follow-ups due today</h3>
          <span
            data-testid="follow-ups-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
          >
            {due.length}
          </span>
        </div>
        <Link
          href="/outreach"
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          Outreach queue →
        </Link>
      </div>

      {due.length === 0 ? (
        <p className="px-4 py-4 text-sm leading-relaxed text-muted-foreground">
          Nothing to nudge. Everything due lands here the day it comes up.
        </p>
      ) : (
        <>
          {canSend ? null : (
            <p
              data-testid="connect-email-nudge"
              className="border-b border-border px-4 py-2 text-xs leading-relaxed text-muted-foreground"
            >
              Connect email in{' '}
              <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
                Settings
              </Link>{' '}
              to send from hunt. Until then, draft and copy each message, then mark it sent.
            </p>
          )}

          <ul>
            {due.map((step) => (
              <li
                key={step.id}
                data-testid="follow-up-row"
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <Link
                  href={`/applications/${step.applicationId}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-2 font-serif text-sm"
                  >
                    {initial(step)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {step.contactName ?? 'No contact yet'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[step.company, step.title].filter(Boolean).join(' · ')}
                      {' — '}
                      <span className="font-mono">
                        step {step.sequenceStep} · day +{step.dayOffset}
                      </span>
                    </span>
                  </span>
                </Link>

                {canSend ? (
                  <FollowUpForm
                    action={dispatch}
                    stepId={step.id}
                    applicationId={step.applicationId}
                    testId="follow-up-send"
                    label="Send"
                    pendingLabel="Sending…"
                  />
                ) : (
                  <span className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/outreach?application=${step.applicationId}`}
                      data-testid="follow-up-draft"
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs')}
                    >
                      Draft
                    </Link>
                    <Link
                      href={`/outreach?application=${step.applicationId}&copy=${step.id}`}
                      data-testid="follow-up-copy"
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}
                    >
                      Copy
                    </Link>
                    <FollowUpForm
                      action={dispatch}
                      stepId={step.id}
                      applicationId={step.applicationId}
                      mode="manual"
                      testId="follow-up-mark-sent"
                      label="Mark sent"
                      pendingLabel="Marking…"
                      variant="ghost"
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** The avatar letter: the human if we know them, otherwise the company. */
function initial(step: FollowUpRow): string {
  const source = step.contactName?.trim() || step.company.trim()
  return source ? source[0].toUpperCase() : '·'
}
