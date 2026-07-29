'use client'

import { Button } from '@/components/ui/button'
import type { TailorChange } from '@/lib/tailor/types'
import { cn } from '@/lib/utils'

/**
 * The honesty moment (TAILORING-DIFF §5). A claim the validator could not trace
 * to the source résumé is shown struck through, in the section where it would
 * have gone, and is never applied and never rendered into the PDF.
 *
 * It states a fact and moves on — no lecture, no warning about "dishonesty",
 * and it gates nothing: the user can still save. `Add it myself` is the designed
 * escape hatch: the claim may go into the Structured editor if it is true,
 * because then the act is the user's, on the user's own document (PHASE-PLAN §1).
 *
 * The product copy is fixed, so the sentence the user reads never depends on how
 * the validator phrased its finding; a `refusedReason` is shown after it as the
 * specific, factual detail (which citation failed), never as a replacement.
 *
 * Contract the shell relies on (e2e gate):
 *  - carries `data-testid="fabrication-flag"`
 *  - **must NOT carry `data-testid="diff-row"`** — a refusal is not an
 *    acceptable change, and the gate counts on the two being distinguishable
 *  - contains the words "no source"
 */
export interface FabricationFlagProps {
  change: TailorChange
  /** Removes the flag from the list. Reversible until save; discards nothing else. */
  onDismiss?: () => void
  /** Opens the Structured tab at `change.path` with an empty input. */
  onAddYourself?: () => void
  className?: string
}

export function FabricationFlag({
  change,
  onDismiss,
  onAddYourself,
  className,
}: FabricationFlagProps) {
  return (
    <li
      data-testid="fabrication-flag"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-warn/35 bg-warn-bg p-3',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-warn/15 font-mono text-[11px] text-warn"
      >
        !
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-serif text-sm leading-relaxed text-faint line-through decoration-warn">
          {change.now}
        </p>

        <p className="mt-1.5 text-[11px] leading-relaxed text-warn">
          <b>Not added — no source.</b> The model proposed this; nothing in your résumé supports it.
          hunt won’t invent experience.
        </p>

        {change.refusedReason ? (
          <p
            data-testid="fabrication-reason"
            className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground"
          >
            {change.refusedReason}
          </p>
        ) : null}

        {onDismiss || onAddYourself ? (
          <div className="mt-2 flex gap-2">
            {onDismiss ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="dismiss-fabrication"
                className="h-7 text-xs"
                onClick={onDismiss}
              >
                Dismiss
              </Button>
            ) : null}

            {onAddYourself ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="add-it-yourself"
                className="h-7 border-warn/50 text-xs text-warn"
                onClick={onAddYourself}
              >
                Add it myself
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
