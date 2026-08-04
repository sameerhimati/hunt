import Link from 'next/link'

import { sequenceView } from '@/lib/outreach/queue'
import type { OutreachStatus, OutreachStepView } from '@/lib/outreach/types'

/**
 * The application detail page's read-only view of where outreach stands — the
 * "outreach timeline" card of `design/Application Detail.dc.html`: one node per
 * step with its status word and cumulative day offset. All actions (draft,
 * edit, send) live on the Outreach screen; this card only reports and links
 * there, so it imports no server actions and no composer.
 *
 * Server component: it reads `sequenceView` directly, which keeps the detail
 * page and the Outreach screen agreeing by construction — same read model, no
 * second counting.
 */

/** Mockup grammar shared with the Outreach screen's rail: `day 0`, then `day +N`. */
function dayLabel(cumulativeOffset: number) {
  return cumulativeOffset === 0 ? 'day 0' : `day +${cumulativeOffset}`
}

/** Dot per the mockup: filled green = sent/replied, muted = halted, hollow = still ahead. */
function dotClass(status: OutreachStatus) {
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

function statusLineClass(status: OutreachStatus) {
  return status === 'sent' || status === 'replied' ? 'text-diff-add' : 'text-faint'
}

function StepRow({ step, last }: { step: OutreachStepView; last: boolean }) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <span aria-hidden className={`size-[9px] shrink-0 rounded-full ${dotClass(step.status)}`} />
        {!last && <span className="w-px flex-1 bg-border" />}
      </div>
      <div className={last ? '' : 'pb-4'}>
        <div className="text-[12.5px] font-semibold">
          Step {step.sequenceStep} · {step.subject}
        </div>
        <div className={`mt-0.5 font-mono text-[10.5px] ${statusLineClass(step.status)}`}>
          {step.status} · {dayLabel(step.cumulativeOffset)}
          {step.sentAt ? ` · ${step.sentAt.toISOString().slice(0, 10)}` : ''}
        </div>
      </div>
    </li>
  )
}

export async function OutreachTimeline({ applicationId }: { applicationId: string }) {
  const view = await sequenceView({ applicationId })
  const steps = view?.steps ?? []

  return (
    <section
      data-testid="application-outreach-timeline"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Outreach</h2>
        {steps.length > 0 && (
          <Link
            href={`/outreach?application=${applicationId}`}
            className="font-mono text-xs text-faint underline underline-offset-2 hover:text-muted-foreground"
          >
            Open in Outreach
          </Link>
        )}
      </div>

      {steps.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          No messages yet. Add a contact and draft a sequence, and each step shows up here with its
          day offset and send date. hunt cannot see your inbox, so tell it when they reply and the
          rest of the sequence stops.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col">
          {steps.map((step, index) => (
            <StepRow key={step.id} step={step} last={index === steps.length - 1} />
          ))}
        </ol>
      )}
    </section>
  )
}
