import type { FitReason } from '@/lib/fit/rate'

/**
 * The "Why it fits" block a result expands into, per `design/Sourcing.dc.html`:
 * a mono heading, then one line per reason — `+` for a match, `~` for a gap —
 * each traced back to a path in the user's own résumé.
 *
 * Gaps read exactly like matches: same type size, same weight, one row down.
 * The block states what the model found and stops; it does not advise, warn, or
 * suggest whether to apply. That is the user's call and hunt has no opinion.
 *
 * Citations render as mono path chips (DESIGN.md §6.2 CitationChip treatment).
 * Every reason and every citation that arrived is rendered — nothing is
 * truncated, collapsed behind a "+2 more", or dropped for being inconvenient.
 * Unresolvable paths were already discarded upstream by
 * `resolvableCitations()`, so a chip on screen always points at real résumé
 * text; a reason with no chips is simply shown uncited rather than hidden.
 *
 * Required testid: `why-it-fits` (the block itself; the card owns the toggle).
 */
export interface WhyItFitsProps {
  reasons: FitReason[]
}

export function WhyItFits({ reasons }: WhyItFitsProps) {
  return (
    <div
      data-testid="why-it-fits"
      className="rounded-[9px] bg-surface-2 px-3.5 py-3 text-[12px] text-foreground"
    >
      <p className="label-mono mb-1.5 text-diff-add">Why it fits</p>

      <ul className="flex flex-col gap-1.5">
        {reasons.map((reason, index) => (
          <li key={index} className="flex gap-2">
            <span
              className={reason.gap ? 'shrink-0 text-warn' : 'shrink-0 text-diff-add'}
              aria-hidden
            >
              {reason.gap ? '~' : '+'}
            </span>

            <span className="min-w-0 leading-relaxed">
              <span className="sr-only">{reason.gap ? 'Gap: ' : 'Match: '}</span>
              {reason.text}

              {reason.citations.length > 0 ? (
                <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                  {reason.citations.map((path) => (
                    <code
                      key={path}
                      title={path}
                      className="rounded border border-border bg-card px-1.5 py-px font-mono text-[10.5px] text-muted-foreground"
                    >
                      {path}
                    </code>
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
