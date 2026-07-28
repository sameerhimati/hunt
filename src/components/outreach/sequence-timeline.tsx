'use client'

import { useState, useTransition } from 'react'

import { markRepliedAction } from '@/app/outreach/actions'
import { buttonVariants } from '@/components/ui/button'
import type { OutreachStatus, OutreachStepView } from '@/lib/outreach/types'
import { cn } from '@/lib/utils'

/**
 * The Sequence rail of `design/Outreach.dc.html`: one node per step with its
 * cumulative `day +N` offset and literal Outreach status, the active step
 * highlighted with an accent ring and an `editing` marker, "+ add step", and
 * the halt-on-reply control.
 *
 * **The halt is manual, and the copy says so.** This rail used to promise
 * "Sequence halts automatically when they reply." It does not. Noticing a reply
 * needs inbound mail — Phase 7, unbuilt — so the sentence described a mechanism
 * that did not exist, on a product whose one differentiator is refusing to
 * claim what it cannot substantiate. The halt itself is real (`markReplied`
 * stops every later step and moves the application to `replied`); it just needs
 * a human to say the word, so the rail asks for it.
 *
 * Selection either calls `onSelect` (when the parent drives state) or falls
 * back to a `?step=<id>` link so the composer can read the choice from the URL.
 *
 * `data-testid="sequence-timeline"` / `"sequence-step"` are asserted by the
 * Phase 4 e2e gate; the gate also asserts the first step's line matches
 * /sent/i after a send, which is why the status word is printed verbatim.
 */

/**
 * A step claimed by a send that never reported back: still pending, but
 * carrying a `sentAt`. Printing its raw status would say `scheduled`, which
 * asserts the message did not go out — and that is the one thing hunt does not
 * know. Mirrors `isUnconfirmed` in `lib/outreach/send`, which cannot be
 * imported here: that module reaches for Prisma, and this one runs in the
 * browser.
 */
export function isUnconfirmedStep(step: Pick<OutreachStepView, 'status' | 'sentAt'>): boolean {
  return step.sentAt !== null && (step.status === 'draft' || step.status === 'scheduled')
}

/** What the rail prints for a step — its status, or the honest "we don't know". */
type StepState = OutreachStatus | 'unconfirmed'

function stateOf(step: OutreachStepView): StepState {
  return isUnconfirmedStep(step) ? 'unconfirmed' : step.status
}

/** Mockup grammar: step 1 reads `day 0`, everything after reads `day +N`. */
function dayLabel(cumulativeOffset: number) {
  return cumulativeOffset === 0 ? 'day 0' : `day +${cumulativeOffset}`
}

/** Dot per the mockup: filled green = sent, accent ring = active, hollow = scheduled, muted = halted. */
function dotClass(state: StepState, active: boolean) {
  if (active) return 'bg-primary ring-[3px] ring-primary/20'
  switch (state) {
    case 'sent':
    case 'replied':
      return 'bg-diff-add'
    case 'unconfirmed':
      return 'bg-warn'
    case 'halted':
    case 'bounced':
      return 'bg-faint'
    default: // scheduled, draft — nothing has happened yet, so hollow
      return 'border-[1.5px] border-faint bg-transparent'
  }
}

function statusLineClass(state: StepState, active: boolean) {
  if (state === 'unconfirmed') return 'text-warn'
  if (active) return 'text-warn'
  if (state === 'sent' || state === 'replied') return 'text-diff-add'
  return 'text-faint'
}

export function SequenceTimeline({
  steps,
  activeStepId,
  onSelect,
}: {
  steps: OutreachStepView[]
  activeStepId?: string
  onSelect?: (stepId: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The reply lands on the last message that actually went out; `markReplied`
  // halts everything after it.
  const replied = steps.find((step) => step.status === 'replied')
  const lastSent = [...steps].reverse().find((step) => step.status === 'sent')

  const recordReply = (stepId: string) => {
    setError(null)
    startTransition(async () => {
      const result = await markRepliedAction(stepId)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div data-testid="sequence-timeline">
      <div className="flex flex-col">
        {steps.map((step, index) => {
          const active = step.id === activeStepId
          const last = index === steps.length - 1
          const state = stateOf(step)
          const body = (
            <>
              <div className={`text-[12.5px] font-semibold ${active ? 'text-primary' : ''}`}>
                Step {step.sequenceStep} · {step.subject}
              </div>
              <div className={`mt-0.5 font-mono text-[10.5px] ${statusLineClass(state, active)}`}>
                {state} · {dayLabel(step.cumulativeOffset)}
                {active ? ' · editing' : ''}
              </div>
            </>
          )
          return (
            <div
              key={step.id}
              data-testid="sequence-step"
              data-active={active ? '' : undefined}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center pt-1">
                <span
                  aria-hidden
                  className={`size-[11px] shrink-0 rounded-full ${dotClass(state, active)}`}
                />
                {!last && <span className="w-px flex-1 bg-border" />}
              </div>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(step.id)}
                  className={`text-left ${last ? '' : 'pb-5'}`}
                >
                  {body}
                </button>
              ) : (
                <a href={`?step=${step.id}`} className={`block ${last ? '' : 'pb-5'}`}>
                  {body}
                </a>
              )}
            </div>
          )
        })}
      </div>
      {replied ? (
        <p className="mt-3.5 text-[11px] leading-relaxed text-faint">
          They replied on step {replied.sequenceStep} — every step after it is halted.
        </p>
      ) : (
        <>
          <p className="mt-3.5 text-[11px] leading-relaxed text-faint">
            hunt cannot see your inbox, so it will not notice a reply on its own. Tell it here and
            the rest of the sequence stops.
          </p>
          {lastSent ? (
            <button
              type="button"
              data-testid="mark-replied"
              disabled={pending}
              onClick={() => recordReply(lastSent.id)}
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'mt-2 w-full text-[11.5px]',
              )}
            >
              {pending ? 'Halting…' : 'They replied'}
            </button>
          ) : null}
        </>
      )}

      {error ? (
        <p data-testid="mark-replied-error" className="mt-2 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
