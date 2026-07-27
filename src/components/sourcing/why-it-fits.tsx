import type { FitReason } from '@/lib/fit/rate'

/**
 * The "Why it fits" block a result expands into, per `design/Sourcing.dc.html`:
 * a mono heading, then one line per reason, each traced back to a path in the
 * user's own résumé.
 *
 * **Three states, three markers**, because they are three different facts:
 *   - `+` (green) — a match, backed by citations that resolve into the résumé.
 *   - `~` (warn) — a gap. Being uncited is correct here; the reason is about
 *     something the résumé does not have.
 *   - `!` (warn) — a claim hunt could not substantiate. The model asserted
 *     something about the user's history and cited nothing, or cited a path
 *     that does not exist. `reason.flag` says which, in words, right there.
 *
 * The third marker is the point. `resolvableCitations()` upstream drops paths
 * that lead nowhere, so an unsourced claim would otherwise render with the same
 * green `+` as a fully-evidenced one — "you built the Kafka ingestion pipeline
 * at Stripe" reading as a grounded fact about the user. hunt does not assert
 * what it cannot substantiate, and when it refuses, the refusal is shown.
 *
 * Gaps and flags read exactly like matches otherwise: same type size, same
 * weight, one row down. The block states what the model found and stops; it
 * does not advise, warn, or suggest whether to apply. That is the user's call
 * and hunt has no opinion.
 *
 * Citations render as mono path chips (DESIGN.md §6.2 CitationChip treatment).
 * Every reason and every citation that arrived is rendered — nothing is
 * truncated, collapsed behind a "+2 more", or dropped for being inconvenient.
 *
 * Required testids: `why-it-fits` (the block itself; the card owns the toggle),
 * `fit-reason-flag` (one per unsourced reason).
 */
export interface WhyItFitsProps {
  reasons: FitReason[]
}

function markerOf(reason: FitReason): { glyph: string; tone: string; label: string } {
  if (reason.flag) return { glyph: '!', tone: 'text-warn', label: 'Unsourced: ' }
  if (reason.gap) return { glyph: '~', tone: 'text-warn', label: 'Gap: ' }
  return { glyph: '+', tone: 'text-diff-add', label: 'Match: ' }
}

export function WhyItFits({ reasons }: WhyItFitsProps) {
  return (
    <div
      data-testid="why-it-fits"
      className="rounded-[9px] bg-surface-2 px-3.5 py-3 text-[12px] text-foreground"
    >
      <p className="label-mono mb-1.5 text-diff-add">Why it fits</p>

      <ul className="flex flex-col gap-1.5">
        {reasons.map((reason, index) => {
          const marker = markerOf(reason)

          return (
            <li key={index} className="flex gap-2">
              <span className={`shrink-0 ${marker.tone}`} aria-hidden>
                {marker.glyph}
              </span>

              <span className="min-w-0 leading-relaxed">
                <span className="sr-only">{marker.label}</span>
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

                {reason.flag ? (
                  <span
                    data-testid="fit-reason-flag"
                    className="mt-1 block text-[11px] leading-relaxed text-warn"
                  >
                    {reason.flag}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
