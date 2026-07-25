import type { ResumeChange } from '@/lib/resume/diff'
import { cn } from '@/lib/utils'

/**
 * One change between two versions, read-only.
 *
 * Comparing versions and reviewing a tailor run are the same act of reading, so
 * they use the same row language (TAILORING-DIFF.md) — this variant simply has
 * no accept/reject, because a comparison of history isn't a decision.
 */

const KIND_STYLES: Record<ResumeChange['kind'], string> = {
  edit: 'text-warn',
  add: 'text-diff-add',
  remove: 'text-diff-del',
  reorder: 'text-muted-foreground',
}

const KIND_LABELS: Record<ResumeChange['kind'], string> = {
  edit: 'edited',
  add: 'added',
  remove: 'removed',
  reorder: 'reordered',
}

export function DiffRow({ change }: { change: ResumeChange }) {
  return (
    <li data-testid="diff-row" className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className={cn('font-mono text-[11px] uppercase', KIND_STYLES[change.kind])}>
          {KIND_LABELS[change.kind]}
        </span>
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {change.path}
        </code>
      </div>

      {change.was ? (
        <p className="mt-2 rounded bg-diff-del-bg px-2 py-1 text-sm text-diff-del line-through decoration-diff-del/40">
          {change.was}
        </p>
      ) : null}

      {change.now ? (
        <p className="mt-1 rounded bg-diff-add-bg px-2 py-1 text-sm text-diff-add">{change.now}</p>
      ) : null}

      {!change.was && !change.now ? (
        <p className="mt-2 text-sm text-muted-foreground">
          The entries in this list moved; none of their text changed.
        </p>
      ) : null}
    </li>
  )
}
