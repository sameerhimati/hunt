'use client'

import { CitationChip } from '@/components/tailor/citation-chip'
import { FabricationFlag } from '@/components/tailor/fabrication-flag'
import type { ChangeDecision } from '@/components/tailor/tailor-workspace'
import { Button } from '@/components/ui/button'
import type { TailorChange } from '@/lib/tailor/types'

/**
 * The canonical detail view for the selected change (TAILORING-DIFF §4), shown
 * inline inside its DiffRow: was → now → why → what it traces to → accept/reject.
 * Refusals from the same section dock at the bottom, so the absence is legible
 * exactly where the claim would have gone (§5).
 *
 * Contract the shell relies on (e2e gate):
 *  - carries `data-testid="change-inspector"`
 *  - the `WHY` label is rendered literally, mono uppercase
 *  - renders a `<CitationChip/>` for `change.citation`
 *  - the primary action carries `data-testid="accept-change"`
 *
 * Every affordance here is wired or absent. Prev/next render only when the
 * shell hands over handlers (the shell also owns the j/k keybindings); without
 * them the panel names the keys rather than showing two dead buttons.
 */
export interface ChangeInspectorProps {
  change: TailorChange
  decision: ChangeDecision
  onAccept: () => void
  onReject: () => void
  /** Scrolls the cited source node into view in the Structured tab. */
  onCite?: (path: string) => void
  /** Refused proposals from the same résumé section, docked at the bottom (§5). */
  refusedInSection?: TailorChange[]
  /** Removes a docked refusal; the Dismiss button hides when absent. */
  onDismissRefused?: (id: string) => void
  /** Walk the change list — mirrors `k` / `j`. */
  onPrev?: () => void
  onNext?: () => void
}

export function ChangeInspector({
  change,
  decision,
  onAccept,
  onReject,
  onCite,
  refusedInSection = [],
  onDismissRefused,
  onPrev,
  onNext,
}: ChangeInspectorProps) {
  const docked = refusedInSection.filter((refused) => refused.id !== change.id)

  return (
    <div
      data-testid="change-inspector"
      className="mt-2.5 flex flex-col gap-2.5 border-t border-border pt-2.5"
    >
      {change.was ? (
        <p
          data-testid="inspector-was"
          className="border-l-2 border-diff-del pl-2 font-serif text-xs leading-relaxed text-muted-foreground"
        >
          {change.was}
        </p>
      ) : null}

      <p
        data-testid="inspector-now"
        className="border-l-2 border-diff-add pl-2 font-serif text-sm leading-relaxed"
      >
        {change.now}
      </p>

      <p className="text-xs leading-relaxed">
        <span className="mr-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
          Why
        </span>
        {change.why}
      </p>

      {change.citation ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Traces to your résumé
          </span>
          <CitationChip
            path={change.citation.path}
            snippet={change.citation.snippet}
            onSelect={onCite}
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="accept-change"
          className="flex-1"
          onClick={onAccept}
        >
          {decision === 'accepted' ? 'Kept' : 'Accept change'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="reject-change"
          onClick={onReject}
        >
          Reject
        </Button>
      </div>

      {onPrev || onNext ? (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="inspector-prev"
            aria-label="Previous change"
            className="h-7 px-2 font-mono text-[10px] text-muted-foreground"
            onClick={onPrev}
            disabled={!onPrev}
          >
            ↑ k · prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="inspector-next"
            aria-label="Next change"
            className="h-7 px-2 font-mono text-[10px] text-muted-foreground"
            onClick={onNext}
            disabled={!onNext}
          >
            next · j ↓
          </Button>
        </div>
      ) : (
        <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          j / k to walk changes · a accept · r reject
        </p>
      )}

      {docked.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Also proposed here — not added
          </span>
          <ul className="flex flex-col gap-2">
            {docked.map((refused) => (
              <FabricationFlag
                key={refused.id}
                change={refused}
                onDismiss={onDismissRefused ? () => onDismissRefused(refused.id) : undefined}
                onAddYourself={onCite ? () => onCite(refused.path) : undefined}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
