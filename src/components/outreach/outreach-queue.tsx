import Link from 'next/link'

import type { QueueEntry, QueueGroup } from '@/lib/outreach/types'
import { cn } from '@/lib/utils'

/**
 * The queue column of `design/Outreach.dc.html`: "Outreach" header with an
 * amber `N due` pill, then the Due today / Active groups, one row per contact.
 *
 * `data-testid="outreach-queue"` is the screen's anchor and must survive every
 * rewrite: the Phase 4 e2e gate asserts it on an otherwise-empty page, so the
 * empty state renders *inside* this container rather than replacing it.
 */
export function OutreachQueue({ groups, selected }: { groups: QueueGroup[]; selected?: string }) {
  const dueCount = groups.reduce(
    (n, group) => n + group.entries.filter((entry) => entry.state === 'due').length,
    0,
  )

  return (
    <div data-testid="outreach-queue" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-[18px] py-4">
        <span className="font-serif text-base font-semibold">Outreach</span>
        {dueCount > 0 && (
          <span className="rounded-full bg-warn-bg px-2 py-0.5 font-mono text-[10.5px] text-warn">
            {dueCount} due
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <p className="p-4 text-sm leading-relaxed text-muted-foreground">
            No sequences yet. Add a contact to an application and draft one there.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <div className="px-[18px] pb-1.5 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                {group.label}
              </div>
              <ul>
                {group.entries.map((entry) => (
                  <QueueRow
                    key={`${entry.applicationId}:${entry.contactId ?? 'none'}`}
                    entry={entry}
                    isSelected={
                      selected !== undefined &&
                      (selected === entry.contactId || selected === entry.applicationId)
                    }
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function QueueRow({ entry, isSelected }: { entry: QueueEntry; isSelected: boolean }) {
  const href = entry.contactId
    ? `/outreach?contact=${entry.contactId}`
    : `/outreach?application=${entry.applicationId}`

  return (
    <li>
      <Link
        href={href}
        data-selected={isSelected ? '' : undefined}
        className={cn(
          'flex gap-[11px] px-[18px] py-[11px]',
          isSelected
            ? 'bg-surface-2 shadow-[inset_2px_0_0_var(--primary)]'
            : 'hover:bg-surface-2/60',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            isSelected ? 'bg-background' : 'bg-surface-2',
          )}
        >
          {initials(entry.contactName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold">{entry.contactName}</span>
          <span
            className={cn(
              'block truncate text-[11px]',
              entry.state === 'replied' ? 'text-diff-add' : 'text-muted-foreground',
            )}
          >
            {entry.company} · <StepStatus entry={entry} />
          </span>
        </span>
      </Link>
    </li>
  )
}

/** The subline's tail: amber when due, green ✓ when replied, muted while waiting. */
function StepStatus({ entry }: { entry: QueueEntry }) {
  if (entry.state === 'replied') return <>replied ✓</>
  if (entry.nextStep === null) return <>scheduled</>
  if (entry.state === 'due') {
    return <span className="text-warn">step {entry.nextStep.sequenceStep} due</span>
  }
  return <>step {entry.nextStep.sequenceStep} scheduled</>
}

/** "Dana Reyes" → "DR"; single names fall back to their first letter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
