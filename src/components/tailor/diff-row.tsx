'use client'

import { type ReactNode, useMemo } from 'react'

import type { ChangeDecision } from '@/components/tailor/tailor-workspace'
import { Button } from '@/components/ui/button'
import { inlineDiff } from '@/lib/tailor/inline-diff'
import type { TailorChange } from '@/lib/tailor/types'
import { cn } from '@/lib/utils'

/**
 * One proposed change, staged like a hunk in a code review (TAILORING-DIFF §3):
 * numbered pin, kind glyph, the change text with **inline word-level** add/del
 * highlighting, and a per-row state chip.
 *
 * Three things this component refuses to do:
 *
 *  1. **Decide anything itself.** Selection and decisions live in the
 *     workspace; the row renders what it is handed and reports clicks. Two
 *     sources of truth for "is this accepted" would eventually save a document
 *     the reviewer never approved.
 *  2. **Offer per-word accept.** The highlighting is word-level so the eye can
 *     find the edit; the decision is per row (§3.1), because staging half a
 *     bullet produces a sentence nobody wrote.
 *  3. **Render a refusal.** `data-testid="diff-row"` marks a change the user
 *     can take, and only ever that. Refusals go through `<FabricationFlag/>` —
 *     visible, struck through, and not a decision.
 *
 * Selecting the row expands the `<ChangeInspector/>` inside it; the workspace
 * passes that in as `children` so the row and the inspector stay independently
 * replaceable.
 */
export interface DiffRowProps {
  change: TailorChange
  /** The pin number — ties the row to its mark in the PDF and the inspector. */
  index: number
  decision: ChangeDecision
  selected: boolean
  onSelect: () => void
  onAccept: () => void
  onReject: () => void
  onUndo: () => void
  /** The ChangeInspector, rendered inline when this row is selected. */
  children?: ReactNode
}

const KIND_GLYPH: Record<TailorChange['kind'], string> = {
  edit: '~',
  add: '+',
  remove: '−',
  reorder: '⇅',
}

const KIND_LABEL: Record<TailorChange['kind'], string> = {
  edit: 'edited',
  add: 'added',
  remove: 'removed',
  reorder: 'reordered',
}

/**
 * 150ms to the resolved state (DESIGN §9). The global reduced-motion block
 * already flattens it; `motion-reduce` states the intent where it is used, so
 * nobody re-adds motion here without meeting the preference.
 */
const RESOLVE =
  'transition-[color,background-color,border-color,opacity] duration-150 ease-out motion-reduce:transition-none'

export function DiffRow({
  change,
  index,
  decision,
  selected,
  onSelect,
  onAccept,
  onReject,
  onUndo,
  children,
}: DiffRowProps) {
  const segments = useMemo(() => inlineDiff(change.was, change.now), [change.was, change.now])
  const resolved = decision !== 'pending'

  return (
    <li
      data-testid="diff-row"
      data-decision={decision}
      aria-current={selected || undefined}
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-lg border p-3',
        RESOLVE,
        selected
          ? 'border-primary bg-surface-2 ring-[3px] ring-primary/10'
          : 'border-transparent hover:bg-surface-2/50',
        decision === 'rejected' && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full font-mono text-xs',
            RESOLVE,
            decision === 'accepted'
              ? 'bg-diff-add-bg text-diff-add'
              : selected
                ? 'bg-primary font-semibold text-primary-foreground'
                : decision === 'rejected'
                  ? 'border border-border text-faint'
                  : 'border border-border text-muted-foreground',
          )}
        >
          {index}
        </span>

        <span className="mt-0.5 font-mono text-xs text-faint" title={KIND_LABEL[change.kind]}>
          <span aria-hidden="true">{KIND_GLYPH[change.kind]}</span>
          <span className="sr-only">{KIND_LABEL[change.kind]}</span>
        </span>

        <span className="min-w-0 flex-1 whitespace-pre-wrap font-serif text-md leading-relaxed">
          {segments.map((segment, position) => {
            if (segment.type === 'same') {
              return <span key={position}>{segment.text}</span>
            }

            return (
              <span
                key={position}
                className={cn(
                  'rounded-sm px-0.5',
                  segment.type === 'add'
                    ? 'bg-diff-add-bg text-diff-add'
                    : 'bg-diff-del-bg text-diff-del line-through decoration-1',
                )}
              >
                {segment.text}
              </span>
            )
          })}
        </span>

        {resolved ? (
          // One control, two readings: what happened, and — under the cursor —
          // the way back. Every decision is reversible until save (§9), so the
          // undo is never hidden behind a menu or a confirm.
          <button
            type="button"
            aria-label={decision === 'accepted' ? 'Undo keeping this change' : 'Restore this change'}
            onClick={(event) => {
              event.stopPropagation()
              onUndo()
            }}
            className={cn(
              'group/chip mt-px shrink-0 rounded border px-1.5 py-0.5 font-mono text-xs',
              RESOLVE,
              decision === 'accepted'
                ? 'border-diff-add text-diff-add hover:bg-diff-add-bg'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="group-hover/chip:hidden group-focus-visible/chip:hidden">
              {decision === 'accepted' ? '✓ kept' : '✕ rejected'}
            </span>
            <span className="hidden group-hover/chip:inline group-focus-visible/chip:inline">
              {decision === 'accepted' ? 'undo' : 'restore'}
            </span>
          </button>
        ) : (
          <span className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              size="sm"
              data-testid="accept-change"
              className="h-6 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation()
                onAccept()
              }}
            >
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={(event) => {
                event.stopPropagation()
                onReject()
              }}
            >
              Reject
            </Button>
          </span>
        )}
      </div>

      {children}
    </li>
  )
}
