'use client'

import Link from 'next/link'
import { useState } from 'react'

import { CheckRow, resumeFieldHref } from '@/components/application/check-card'
import { Skeleton } from '@/components/ui/skeleton'
import type { CheckOutcome, MatchRatingDetail } from '@/lib/checks/types'
import type { FitTier } from '@/lib/db/enums'
import { cn } from '@/lib/utils'

/**
 * The fifth reading: how this résumé sits against this posting.
 *
 * It lives beside the four checks and deliberately does **not** carry their
 * `data-testid="check-card"`. Two reasons, and the second is the real one:
 * the e2e gate counts the measurable checks exactly, and a match rating is a
 * different kind of statement — a qualitative judgement with citations, not an
 * instrument reading. Rendering it as a fifth check card would quietly invite
 * someone to average the five, which is the ATS score wearing a new hat.
 *
 * The tier vocabulary is `src/lib/fit/rate.ts`'s and nobody else's — Strong,
 * Possible, Reach, no fourth tier, no number. Reach is not a failure state; it
 * is a legitimate application with the gaps named, so the copy here treats it
 * as information, never as discouragement.
 */

export interface MatchRatingCardProps {
  /** The reading, once taken. Absent = not run yet. */
  outcome?: CheckOutcome | null
  running?: boolean
  /** Enables the citation deep links into the exact résumé field. */
  resumeId?: string | null
  onRun: () => void
}

const TIER_LABEL: Record<FitTier, string> = {
  strong: 'Strong fit',
  possible: 'Possible fit',
  reach: 'Reach',
}

const TIER_PILL: Record<FitTier, string> = {
  strong: 'bg-diff-add-bg text-pass',
  possible: 'bg-surface-2 text-foreground',
  reach: 'bg-surface-2 text-muted-foreground',
}

/**
 * Heuristic, and only ever additive: the reason itself is always printed, so a
 * miss here costs the user a shortcut, never the explanation.
 */
const KEY_MISSING = /\b(model|key)\b/i

export function MatchRatingCard({ outcome, running = false, resumeId, onRun }: MatchRatingCardProps) {
  const [expanded, setExpanded] = useState(false)

  const detail = outcome && !outcome.error ? (outcome.details as MatchRatingDetail | null) : null
  const tier = detail?.tier
  const reasons = Array.isArray(detail?.reasons) ? detail.reasons : []
  const expandable = Boolean(outcome) && !running

  return (
    <div data-testid="match-rating" className="bg-surface-2/40 px-4 py-3">
      <CheckRow
        name="Match rating"
        expandable={expandable}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      >
        {running ? (
          <Skeleton className="h-3 w-24" data-testid="match-rating-skeleton" />
        ) : outcome && tier ? (
          <span
            data-testid="fit-tier"
            className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', TIER_PILL[tier])}
          >
            {TIER_LABEL[tier]}
          </span>
        ) : outcome ? (
          <span className="font-mono text-xs text-warn">Not measured</span>
        ) : (
          <button
            type="button"
            data-testid="run-check-match_rating"
            onClick={onRun}
            className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
          >
            Run
          </button>
        )}
      </CheckRow>

      {expandable && expanded && outcome ? (
        <div data-testid="match-rating-specifics" className="mt-2.5 space-y-2 pl-5">
          {outcome.error ? (
            <>
              <p className="text-xs leading-relaxed text-warn">{outcome.error}</p>
              {KEY_MISSING.test(outcome.error) ? (
                <Link
                  href="/settings#section-llm"
                  data-testid="match-rating-settings-link"
                  className="inline-block font-mono text-[11px] text-warn underline underline-offset-2 hover:text-foreground"
                >
                  Add the key in Settings →
                </Link>
              ) : null}
              <p className="text-xs leading-relaxed text-muted-foreground">
                The other four checks above are deterministic and ran without it.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Qualitative, and traced to your own résumé. There is no percentage here because
                nobody outside the hiring team can compute one honestly.
              </p>
              <ul className="space-y-1.5">
                {reasons.map((reason, index) => (
                  <li
                    key={`${index}-${reason.text.slice(0, 24)}`}
                    data-testid="fit-reason"
                    className="flex items-start gap-2 text-xs leading-relaxed"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-px shrink-0 font-mono text-[11px]',
                        reason.gap ? 'text-warn' : 'text-pass',
                      )}
                    >
                      {reason.gap ? '~' : '+'}
                    </span>
                    <span className="min-w-0 flex-1">
                      {reason.text}
                      {reason.citations.length > 0 ? (
                        <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
                          {reason.citations.map((path) => {
                            const href = resumeFieldHref(resumeId, path)
                            return href ? (
                              <Link
                                key={path}
                                href={href}
                                data-testid="fit-citation"
                                className="rounded-sm bg-surface-2 px-1 font-mono text-[10px] text-primary hover:underline"
                              >
                                {path}
                              </Link>
                            ) : (
                              <span
                                key={path}
                                data-testid="fit-citation"
                                className="rounded-sm bg-surface-2 px-1 font-mono text-[10px] text-faint"
                              >
                                {path}
                              </span>
                            )
                          })}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
