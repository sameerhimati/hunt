'use client'

import { ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  markSentManuallyAction,
  regenerateAction,
  saveDraftAction,
  sendStepAction,
} from '@/app/outreach/actions'
import { isUnconfirmedStep } from '@/components/outreach/sequence-timeline'
import { Button } from '@/components/ui/button'
import type { OutreachCitation, OutreachStepView } from '@/lib/outreach/types'
import { cn } from '@/lib/utils'

/**
 * The message editor card of `design/Outreach.dc.html`: step header, Subject,
 * body, and the row of actions underneath.
 *
 * Two decisions worth naming.
 *
 * **Send saves first.** The row on disk is what leaves the building, so if the
 * box is dirty we persist it and only then send. Otherwise a last-minute edit
 * would sit on screen while the previous draft went out — the one failure mode
 * an outreach tool must never have.
 *
 * **Regenerate does not write.** It asks the model and hands back a draft; the
 * message on disk changes when the user says so (Save draft, or Send). That is
 * also why citation chips only appear right after a regenerate: `Outreach` has
 * no citations column and the schema is frozen this wave, so provenance for a
 * *persisted* message is the footer line rather than per-claim underlines. A
 * deliberate v1 gap — inventing a storage shape here would strand it.
 */

/**
 * Which action holds the row, or `null` when it is free.
 *
 * **Why this is plain state and not a `useTransition` pending flag.** React
 * settles an async transition's `isPending` a tick *after* it commits the state
 * the transition awaited. So a regenerated draft paints — new subject, new body,
 * citation chips — in a commit where every control is still disabled, and React
 * does not dispatch click handlers for a disabled button. The click is dropped:
 * no handler, no error, no feedback. Usually that window is sub-millisecond; on
 * a busy main thread it outlives a real click. Plain state set in the same async
 * continuation as the result clears in the same commit that paints it, which is
 * what "in flight" was always supposed to mean. `sourcing/workspace.tsx` makes
 * the same trade, for the same reason.
 *
 * **Why one flag and not one per button.** These four write the same row through
 * the same `persist()`, and the text on screen is the thing they write, so they
 * genuinely must not overlap: a regenerate landing mid-send would replace the
 * copy that is already on the wire. Sharing is the point — sharing a flag that
 * outlives the paint was the bug. Copy is not in here: it reads the box, calls
 * no action and blocks nothing, so it is gated by nothing.
 */
type Busy = 'regenerating' | 'saving' | 'sending' | 'marking' | null

export function MessageEditor({
  step,
  contactEmail,
  contactName,
  emailConfigured,
}: {
  step: OutreachStepView
  contactEmail: string | null
  contactName: string | null
  emailConfigured: boolean
}) {
  const [subject, setSubject] = useState(step.subject)
  const [body, setBody] = useState(step.body)
  const [dirty, setDirty] = useState(false)
  const [citations, setCitations] = useState<OutreachCitation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onDocumentClick = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [menuOpen])

  /** Someone else has the row. Copy is never held: it writes nothing. */
  const held = busy !== null

  const sendable = step.status === 'draft' || step.status === 'scheduled'
  // A step hunt claimed for a send it never got an answer to. It is neither
  // sent nor safe to assume unsent, and the footer has to say so out loud.
  const unconfirmed = isUnconfirmedStep(step)

  /**
   * Every action runs the same way: clear the last answer, then report this one.
   *
   * `which` is the flag the action holds while it is in flight — or nothing, for
   * an action that neither waits on the server nor blocks anything else.
   */
  const run = (which: Busy, work: () => Promise<string | null>) => {
    setError(null)
    setNote(null)
    setMenuOpen(false)
    if (which) setBusy(which)

    void (async () => {
      try {
        const failure = await work()
        if (failure) setError(failure)
      } finally {
        if (which) setBusy(null)
      }
    })()
  }

  const persist = async (): Promise<string | null> => {
    if (!dirty) return null
    const result = await saveDraftAction(step.id, { subject, body })
    if (result.error) return result.error
    setDirty(false)
    return null
  }

  const save = () =>
    run('saving', async () => {
      const failure = await persist()
      if (!failure) setNote('Draft saved.')
      return failure
    })

  const send = () =>
    run('sending', async () => {
      const failure = await persist()
      if (failure) return failure
      // On an unconfirmed step this button reads "Send again", so pressing it
      // *is* the user telling hunt the first attempt never landed.
      const result = await sendStepAction(step.id, { confirmResend: unconfirmed })
      if (result.note) setNote(result.note)
      return result.error ?? null
    })

  const regenerate = () =>
    run('regenerating', async () => {
      const result = await regenerateAction(step.id)
      if (result.error) return result.error
      if (result.subject !== undefined) setSubject(result.subject)
      if (result.body !== undefined) setBody(result.body)
      setCitations(result.citations ?? [])
      setDirty(true)
      setNote('New draft — save it or send it.')
      return null
    })

  const markSent = () =>
    run('marking', async () => {
      const failure = await persist()
      if (failure) return failure
      const result = await markSentManuallyAction(step.id)
      return result.error ?? null
    })

  const copy = () =>
    run(null, async () => {
      // Same shape as `messageText` in lib/outreach/send, built here rather than
      // fetched: what the user copies must be what is in the box, including the
      // edit they have not saved yet.
      const recipient = [contactName, contactEmail && `<${contactEmail}>`].filter(Boolean).join(' ')
      const text = [recipient ? `To: ${recipient}` : null, `Subject: ${subject}`, '', body]
        .filter((line) => line !== null)
        .join('\n')
      try {
        await navigator.clipboard.writeText(text)
        setNote('Copied — paste it into your mail client.')
      } catch {
        // Clipboard access can be refused (no permission, insecure origin).
        // Saying so beats a button that silently does nothing.
        return 'Your browser would not let hunt reach the clipboard. Select the message and copy it by hand.'
      }
      return null
    })

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-4 border-b border-border px-[18px] py-3.5">
        <h3 className="text-[13px] font-semibold">
          Step {step.sequenceStep} · {STEP_NAMES[step.sequenceStep] ?? 'Follow-up'}
        </h3>
        <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
          drafted from role + your résumé highlights
        </span>
      </header>

      <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-4">
        <label htmlFor="message-subject" className="w-[52px] shrink-0 font-mono text-[11px] text-faint">
          Subject
        </label>
        <input
          id="message-subject"
          data-testid="message-subject"
          value={subject}
          autoComplete="off"
          placeholder="What lands in their inbox"
          onChange={(event) => {
            setSubject(event.target.value)
            setDirty(true)
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
        />
      </div>

      <textarea
        data-testid="message-body"
        value={body}
        aria-label="Message body"
        placeholder={`Hi ${contactName?.split(' ')[0] ?? 'there'} —`}
        onChange={(event) => {
          setBody(event.target.value)
          setDirty(true)
        }}
        className="min-h-[220px] flex-1 resize-none bg-transparent p-[18px] text-[13.5px] leading-[1.7] outline-none placeholder:text-faint"
      />

      {citations.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-[18px] py-2.5">
          <span className="font-mono text-[10.5px] text-faint">cites</span>
          {citations.map((citation) => (
            <span
              key={citation.path}
              data-testid="citation-chip"
              title={citation.snippet ?? citation.path}
              className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
            >
              {citation.path}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          data-testid="composer-error"
          className="border-t border-border bg-destructive/10 px-[18px] py-2.5 text-xs leading-relaxed text-destructive"
        >
          {error}
        </p>
      ) : note ? (
        <p
          data-testid="composer-note"
          className="border-t border-border px-[18px] py-2.5 font-mono text-[10.5px] text-muted-foreground"
        >
          {note}
        </p>
      ) : null}

      {unconfirmed ? (
        <p
          data-testid="send-unconfirmed"
          className="border-t border-border bg-warn-bg px-[18px] py-2.5 text-xs leading-relaxed text-warn"
        >
          hunt started sending this and never got an answer back, so it may already be in their
          inbox. Check your sent mail — then mark it sent, or send it again if it never left.
        </p>
      ) : null}

      {!emailConfigured ? (
        <p className="border-t border-border px-[18px] py-2.5 font-mono text-[10.5px] text-faint">
          No email key yet — hunt drafts and tracks, you send from your own client.
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-[18px] py-3.5">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            data-testid="regenerate"
            variant="outline"
            size="sm"
            disabled={held}
            onClick={regenerate}
          >
            Regenerate
          </Button>
          <span className="font-mono text-[10.5px] text-faint">every claim cites your résumé</span>
        </div>

        <div className="flex items-center gap-2.5">
          {!sendable ? (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {step.status}
              {step.sentAt ? ` · ${step.sentAt.toISOString().slice(0, 10)}` : ''}
            </span>
          ) : null}

          <Button
            type="button"
            data-testid="save-draft"
            variant="outline"
            size="sm"
            disabled={held}
            onClick={save}
          >
            Save draft
          </Button>

          <div ref={menu} className="relative flex items-center">
            {emailConfigured ? (
              <>
                <Button
                  type="button"
                  data-testid="send-now"
                  size="sm"
                  className="rounded-r-none"
                  disabled={held || !sendable}
                  onClick={send}
                >
                  {busy === 'sending' ? 'Sending…' : unconfirmed ? 'Send again' : 'Send now'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Other ways to send"
                  data-testid="send-options"
                  className="rounded-l-none border-l border-primary-foreground/20 px-2"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <ChevronUp size={14} aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button
                type="button"
                data-testid="copy-message"
                variant="outline"
                size="sm"
                onClick={copy}
              >
                Copy message
              </Button>
            )}

            {/*
              Always in the DOM, hidden until asked for: the degraded path has to
              be reachable in one click from the send control, and a menu that
              only mounts on open is a menu nothing can find. When there is no
              email key at all, "mark as sent manually" *is* the primary action.
            */}
            <div
              role="menu"
              hidden={emailConfigured && !menuOpen}
              className={cn(
                emailConfigured
                  ? 'absolute bottom-full right-0 z-20 mb-1.5 w-56 rounded-md border border-border bg-popover p-1 shadow-lg'
                  : 'ml-2.5 flex items-center',
                emailConfigured && !menuOpen && 'hidden',
              )}
            >
              {emailConfigured ? (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="copy-message"
                  onClick={copy}
                  className="w-full rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-surface-2"
                >
                  Copy message
                </button>
              ) : null}

              <button
                type="button"
                role={emailConfigured ? 'menuitem' : undefined}
                data-testid="mark-sent-manually"
                disabled={held || !sendable}
                onClick={markSent}
                className={cn(
                  'transition-colors duration-150 disabled:opacity-50',
                  emailConfigured
                    ? 'w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2'
                    : 'inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90',
                )}
              >
                Mark as sent manually
              </button>
            </div>
          </div>
        </div>
      </footer>
    </section>
  )
}

/** The cadence the default sequence deals: intro, nudge, last nudge. */
const STEP_NAMES: Record<number, string> = { 1: 'Intro', 2: 'Follow-up', 3: 'Last nudge' }
