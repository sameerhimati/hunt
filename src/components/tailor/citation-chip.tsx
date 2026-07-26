'use client'

import { cn } from '@/lib/utils'

/**
 * The provenance atom (TAILORING-DIFF §4): a mono path into the *source*
 * résumé (`experience[0].bullets[3]`) and the snippet it rests on. Clicking it
 * scrolls that node into view in the Structured tab, which is what makes a
 * citation checkable in one click rather than a claim about a claim.
 *
 * The path renders **raw**, not prettified into "Experience · Ramp · bullet 4".
 * A citation is an instrument; you check it against the document, and a
 * friendlier label would be one more thing standing between the user and the
 * evidence.
 *
 * A chip is only ever drawn for a citation that resolved. `validateChanges`
 * decides that — a change whose path does not resolve into the source is
 * refused and never reaches a DiffRow — and this component holds the same line
 * at the last inch: `resolved={false}`, or a path that is not a path, renders
 * nothing rather than lending the authority of a chip to a dead reference.
 */
export interface CitationChipProps {
  path: string
  /** The exact source text, quoted in serif italic under the chip. */
  snippet?: string | null
  /**
   * False when the caller already knows the path does not resolve into the
   * source content. Defaults true because the validator has normally answered
   * this question before a change gets rendered at all.
   */
  resolved?: boolean
  /** Scrolls the cited source node into view in the Structured tab. */
  onSelect?: (path: string) => void
  className?: string
}

/** `experience[0].bullets[3]`, `basics.summary`, `skills[1].items[0]`. */
const PATH = /^[A-Za-z][A-Za-z0-9_]*(?:\[\d+\]|\.[A-Za-z][A-Za-z0-9_]*)*$/

export function CitationChip({
  path,
  snippet,
  resolved = true,
  onSelect,
  className,
}: CitationChipProps) {
  if (!resolved || !PATH.test(path.trim())) return null

  const chip = 'rounded border border-border px-1.5 py-0.5 font-mono text-xs text-primary'

  return (
    <span className={cn('inline-flex flex-col items-start gap-1.5', className)}>
      {onSelect ? (
        <button
          type="button"
          data-testid="citation-chip"
          title="Show this in the Structured tab"
          onClick={() => onSelect(path)}
          className={cn(
            chip,
            'transition-colors duration-150 ease-out hover:bg-surface-2 motion-reduce:transition-none',
          )}
        >
          {path}
        </button>
      ) : (
        <span data-testid="citation-chip" className={chip}>
          {path}
        </span>
      )}

      {snippet ? (
        <span className="font-serif text-sm italic leading-relaxed text-muted-foreground">
          “{snippet}”
        </span>
      ) : null}
    </span>
  )
}
