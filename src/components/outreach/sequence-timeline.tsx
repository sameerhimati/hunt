'use client'

import type { OutreachStatus, OutreachStepView } from '@/lib/outreach/types'

/**
 * The Sequence rail of `design/Outreach.dc.html`: one node per step with its
 * cumulative `day +N` offset and literal Outreach status, the active step
 * highlighted with an accent ring and an `editing` marker, "+ add step", and
 * the note that the sequence halts on reply.
 *
 * Purely presentational — no fetching, no server actions. Selection either
 * calls `onSelect` (when the parent drives state) or falls back to a
 * `?step=<id>` link so the composer can read the choice from the URL.
 *
 * `data-testid="sequence-timeline"` / `"sequence-step"` are asserted by the
 * Phase 4 e2e gate; the gate also asserts the first step's line matches
 * /sent/i after a send, which is why the status word is printed verbatim.
 */

/** Mockup grammar: step 1 reads `day 0`, everything after reads `day +N`. */
function dayLabel(cumulativeOffset: number) {
  return cumulativeOffset === 0 ? 'day 0' : `day +${cumulativeOffset}`
}

/** Dot per the mockup: filled green = sent, accent ring = active, hollow = scheduled, muted = halted. */
function dotClass(status: OutreachStatus, active: boolean) {
  if (active) return 'bg-primary ring-[3px] ring-primary/20'
  switch (status) {
    case 'sent':
    case 'replied':
      return 'bg-diff-add'
    case 'halted':
    case 'bounced':
      return 'bg-faint'
    default: // scheduled, draft — nothing has happened yet, so hollow
      return 'border-[1.5px] border-faint bg-transparent'
  }
}

function statusLineClass(status: OutreachStatus, active: boolean) {
  if (active) return 'text-warn'
  if (status === 'sent' || status === 'replied') return 'text-diff-add'
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
  return (
    <div data-testid="sequence-timeline">
      <div className="flex flex-col">
        {steps.map((step, index) => {
          const active = step.id === activeStepId
          const last = index === steps.length - 1
          const body = (
            <>
              <div className={`text-[12.5px] font-semibold ${active ? 'text-primary' : ''}`}>
                Step {step.sequenceStep} · {step.subject}
              </div>
              <div
                className={`mt-0.5 font-mono text-[10.5px] ${statusLineClass(step.status, active)}`}
              >
                {step.status} · {dayLabel(step.cumulativeOffset)}
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
                  className={`size-[11px] shrink-0 rounded-full ${dotClass(step.status, active)}`}
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
      <div className="mt-4 rounded-lg border border-dashed border-border p-2 text-center text-[11.5px] text-primary">
        + add step
      </div>
      <p className="mt-3.5 text-[11px] leading-relaxed text-faint">
        Sequence halts automatically when they reply.
      </p>
    </div>
  )
}
