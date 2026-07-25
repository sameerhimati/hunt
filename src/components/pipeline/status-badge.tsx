import { STATUS_LABELS, type ApplicationStatus } from '@/lib/pipeline/statuses'
import { cn } from '@/lib/utils'

/**
 * One hue per status on `surface-2`, never a saturated fill: a board with
 * fourteen cards has to stay calm enough to read (DESIGN.md §6.2).
 */
const STATUS_TONE: Record<ApplicationStatus, string> = {
  sourced: 'text-muted-foreground',
  tailored: 'text-[color:var(--primary)]',
  applied: 'text-[color:var(--primary)]',
  outreach: 'text-[color:var(--warn)]',
  replied: 'text-[color:var(--warn)]',
  interview: 'text-[color:var(--diff-add)]',
  offer: 'text-[color:var(--diff-add)]',
  rejected: 'text-faint',
}

export function StatusDot({ status }: { status: ApplicationStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-1.5 rounded-full bg-current', STATUS_TONE[status])}
    />
  )
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs',
        STATUS_TONE[status],
      )}
    >
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  )
}
