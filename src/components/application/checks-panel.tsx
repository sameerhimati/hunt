'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  loadChecksAction,
  runChecksAction,
  type ChecksSnapshot,
} from '@/app/applications/[id]/checks-actions'
import { CheckCard, type CheckCardKind } from '@/components/application/check-card'
import { MatchRatingCard } from '@/components/application/match-rating-card'
import { Button } from '@/components/ui/button'
import type { CheckOutcome } from '@/lib/checks/types'
import { CHECK_KINDS, type CheckKind } from '@/lib/db/enums'

/**
 * The checks panel (SCREENS §4/§7, `Application Detail.dc.html`).
 *
 * The header line is the product position, not decoration: **no fake ATS
 * score — by design.** Every other résumé tool prints a number nobody can
 * verify against a system nobody outside the employer can see. hunt reports
 * what it actually measured, one instrument per card, with the count in mono
 * and the fix a click away. There is no aggregate for the same reason there is
 * no score: five honest readings do not average into a sixth honest one.
 *
 * All five cards are on screen **before** anything has been measured — the
 * not-run state carries a per-check Run, and a sweep swaps counts for
 * skeletons. That is what SCREENS §7 asks for, and it also means the panel is
 * never an empty box on a page the user just opened.
 *
 * The panel reads the application id from the route rather than taking it as a
 * prop: `app/applications/[id]/page.tsx` is a frozen Wave-1 seam that renders
 * `<ChecksPanel/>` with no arguments, and Phase 3 fills its own slot without
 * reopening that file.
 */

/** The four measurable checks, derived from the registry so a kind can never quietly vanish. */
const CARD_KINDS = CHECK_KINDS.filter((kind): kind is CheckCardKind => kind !== 'match_rating')

/**
 * Both actions return their reasons instead of throwing, so a rejection here is
 * never a check result — it is the call not arriving: hunt stopped, the tab
 * outlived the server, a 500 on the way back. That has to reach the screen.
 * Swallowed, it left the button reading "Running…" until a full reload.
 */
function transportFailure(cause: unknown, attempt: string): string {
  const detail = cause instanceof Error && cause.message ? cause.message : String(cause)
  return `${attempt} never reached the server (${detail}). hunt runs on this machine — check it is still running, then try again.`
}

export function ChecksPanel() {
  const params = useParams<{ id: string }>()
  const applicationId = typeof params?.id === 'string' ? params.id : null

  const [snapshot, setSnapshot] = useState<ChecksSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  // Until the first read comes back the panel knows nothing about this
  // application, and "no résumé pinned yet" / "Nothing measured yet" are
  // assertions about the user's data, not neutral placeholders.
  const [reading, setReading] = useState(true)

  // A run started before the initial read came back wins: the user asked for a
  // fresh measurement, and letting a slower load overwrite it with the previous
  // one would show them a stale reading with no way to tell.
  const runStarted = useRef(false)

  useEffect(() => {
    if (!applicationId) return
    let cancelled = false

    void loadChecksAction(applicationId)
      .then((result) => {
        if (cancelled || runStarted.current) return
        if (result.ok) setSnapshot(result.snapshot)
        else setError(result.error)
      })
      .catch((cause: unknown) => {
        if (cancelled || runStarted.current) return
        setError(transportFailure(cause, 'Reading the saved checks'))
      })
      .finally(() => {
        // Clears even when a run got in first: the load is over either way, and
        // leaving this set would hold the panel in skeletons forever.
        if (!cancelled) setReading(false)
      })

    return () => {
      cancelled = true
    }
  }, [applicationId])

  const run = useCallback(() => {
    if (!applicationId || running) return

    runStarted.current = true
    setRunning(true)
    setError(null)

    void runChecksAction(applicationId)
      .then((result) => {
        if (result.ok) setSnapshot(result.snapshot)
        else setError(result.error)
      })
      .catch((cause: unknown) => {
        setError(transportFailure(cause, 'Running the checks'))
      })
      .finally(() => {
        setRunning(false)
      })
  }, [applicationId, running])

  const outcomes = new Map<CheckKind, CheckOutcome>()
  for (const outcome of snapshot?.outcomes ?? []) outcomes.set(outcome.kind, outcome)

  const version = snapshot?.version ?? null
  const hasRun = outcomes.size > 0
  // Without a route id there is nothing to read, so nothing is outstanding —
  // derived rather than an effect that immediately sets state back.
  const loading = reading && applicationId !== null
  // A sweep and an unfinished first read look the same from the cards' side:
  // there is a reading coming and we don't have it yet.
  const pending = running || loading

  return (
    <section
      data-testid="checks-panel"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-serif text-base font-semibold">Checks</h2>
          <span className="font-mono text-[10px] text-faint">
            {version ? `on ${version.label}` : loading ? 'reading…' : 'no résumé pinned yet'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10.5px] text-muted-foreground">
            no fake ATS score — by design
          </span>
          <Button
            type="button"
            data-testid="run-checks"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={running || !applicationId}
            onClick={run}
          >
            {running ? 'Running…' : hasRun ? 'Re-run checks' : 'Run checks'}
          </Button>
        </div>
      </header>

      {error ? (
        <p
          data-testid="checks-error"
          className="border-b border-border bg-warn-bg px-4 py-2.5 text-xs leading-relaxed text-warn"
        >
          {error}
        </p>
      ) : null}

      <div>
        {CARD_KINDS.map((kind) => (
          <CheckCard
            key={kind}
            kind={kind}
            outcome={outcomes.get(kind)}
            running={pending}
            defaultExpanded={kind === 'parse_fidelity'}
            resumeId={version?.resumeId}
            onRun={run}
          />
        ))}

        <MatchRatingCard
          outcome={outcomes.get('match_rating')}
          running={pending}
          resumeId={version?.resumeId}
          onRun={run}
        />
      </div>

      {!hasRun && !pending ? (
        <p className="border-t border-border px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Nothing measured yet. Each check reports one concrete count on the version pinned to this
          application — and tells you which field to open when it finds something.
        </p>
      ) : null}
    </section>
  )
}
