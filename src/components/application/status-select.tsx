'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { StatusBadge, StatusDot } from '@/components/pipeline/status-badge'
import { APPLICATION_STATUSES, STATUS_LABELS, type ApplicationStatus } from '@/lib/pipeline/statuses'
import { cn } from '@/lib/utils'

/**
 * The status control on the application header.
 *
 * Each option is a submit button in a real `<form method="post">` — see the
 * route handler for why. The menu is hand-rolled rather than a Radix dropdown
 * for the same reason: a portalled menu that intercepts the click would turn
 * the form submission back into a JavaScript-only path.
 */
export function StatusSelect({
  applicationId,
  status,
}: {
  applicationId: string
  status: ApplicationStatus
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onDocumentClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocumentClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocumentClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        data-testid="status-select"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm transition-colors duration-150 hover:bg-surface-2"
      >
        <StatusBadge status={status} />
        <ChevronDown size={14} className="text-muted-foreground" aria-hidden="true" />
      </button>

      {open ? (
        <form
          method="post"
          action={`/api/applications/${applicationId}/status`}
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {APPLICATION_STATUSES.map((option) => (
            <button
              key={option}
              type="submit"
              name="status"
              value={option}
              role="menuitem"
              data-testid={`status-option-${option}`}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-surface-2',
                option === status && 'bg-surface-2',
              )}
            >
              <StatusDot status={option} />
              {STATUS_LABELS[option]}
            </button>
          ))}
        </form>
      ) : null}
    </div>
  )
}
