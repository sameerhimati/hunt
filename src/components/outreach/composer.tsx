import { DegradedBanner } from '@/components/degraded-banner'
import { MessageEditor } from '@/components/outreach/message-editor'
import { SequenceTimeline } from '@/components/outreach/sequence-timeline'
import type { ContactSource, OutreachStepView, SequenceView } from '@/lib/outreach/types'

/**
 * The composer half of `design/Outreach.dc.html` — who you are writing to, the
 * sequence they sit in, and the message itself.
 *
 * Server component on purpose: everything it renders is server-shaped
 * (`SequenceView` carries `Date`s), and keeping it out of the client bundle
 * means only the editor's handful of state ships as JavaScript. The timeline
 * belongs to another task — imported, never edited.
 *
 * The step the editor opens is the first one still waiting to go out. That is
 * the same rule the queue sorts on, so "Dana Reyes · step 2 due" in the left
 * column and the step in the editor can never disagree. When a sequence has
 * finished, the last step stays on screen rather than the panel emptying: what
 * you actually sent is worth reading back.
 */
export interface ComposerProps {
  sequence: SequenceView | null
  /**
   * True when the sequence on screen was just dealt from hunt's template
   * because no model was configured. Required rather than defaulted: the
   * silence is the bug this flag exists to fix, and a prop that can be
   * forgotten is silence again.
   */
  templated: boolean
}

export function Composer({ sequence, templated }: ComposerProps) {
  if (!sequence) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
          Nothing to write yet. Pick an application, add the human you want to reach, and draft a
          sequence there.
        </p>
      </div>
    )
  }

  const { contact, steps, fromAddress, emailConfigured } = sequence
  const active = activeStep(steps)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-[56px] shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold"
          >
            {initials(contact?.name)}
          </span>
          <div className="min-w-0">
            <p data-testid="composer-contact" className="truncate text-[13.5px] font-semibold">
              {contact?.name ?? 'No contact yet'}
              {contact ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · {describeContact(contact.title, contact.company)}
                </span>
              ) : null}
            </p>
            <p className="truncate font-mono text-[10.5px] text-muted-foreground">
              {contact?.email ?? 'no email address'}
              {contact ? ` · ${SOURCE_LABELS[contact.source]}` : ''}
            </p>
          </div>
        </div>

        <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {fromAddress ? (
            <>
              sending from <span className="text-foreground">{fromAddress}</span>
            </>
          ) : (
            'no sending address set'
          )}
        </p>
      </header>

      {/*
        Outside the scrolling body on purpose: what the user is about to send
        is not the model's writing, and that has to still be on screen when
        they reach the send button.
      */}
      {templated ? (
        <DegradedBanner
          className="mx-6 mt-5 shrink-0"
          feature="Drafting"
          needs="an LLM key — Anthropic or an OpenAI-compatible endpoint"
          stillWorks="These three messages are hunt’s template: no model read your résumé, and step 1 leaves the sentence about your own work in brackets for you to write. Editing, scheduling and sending all work exactly the same."
          settingsSection="llm"
        />
      ) : null}

      <div className="flex min-h-0 flex-1 gap-[22px] overflow-y-auto p-6">
        <div className="w-[230px] shrink-0">
          <h2 className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Sequence
          </h2>
          <SequenceTimeline steps={steps} activeStepId={active?.id} />
        </div>

        {active ? (
          <MessageEditor
            // Re-keyed per step: sending step 1 advances the editor to step 2,
            // and the draft in the box must advance with it rather than linger.
            key={active.id}
            step={active}
            contactEmail={contact?.email ?? null}
            contactName={contact?.name ?? null}
            emailConfigured={emailConfigured}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-card p-6">
            <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
              No messages in this sequence yet. Draft one from the contact on the application.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Statuses that still have a send ahead of them — the pair the engine walks. */
const PENDING: readonly string[] = ['draft', 'scheduled']

function activeStep(steps: OutreachStepView[]): OutreachStepView | undefined {
  return steps.find((step) => PENDING.includes(step.status)) ?? steps.at(-1)
}

const SOURCE_LABELS: Record<ContactSource, string> = {
  apollo: 'via Apollo',
  linkedin: 'via LinkedIn',
  brightdata: 'via Bright Data',
  manual: 'added by hand',
}

function describeContact(title: string | null, company: string | null): string {
  return [title, company].filter(Boolean).join(', ') || 'no title recorded'
}

function initials(name?: string | null): string {
  if (!name) return '—'
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
  return letters.toUpperCase() || '—'
}
