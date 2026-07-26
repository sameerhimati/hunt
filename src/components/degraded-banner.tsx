import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The key-missing state, exactly as `design/System States.dc.html` §02 draws it:
 * a warn-toned card that says what stopped working, what still works without the
 * key, and links straight to the Settings card that fixes it.
 *
 * Shared by every screen with an optional dependency (sourcing without a job
 * board, outreach without an email sender), so it stays deliberately dumb:
 * props only, no provider knowledge, no fetching, no state. The screen decides
 * *when* it is degraded and dims its own controls around it.
 */
export interface DegradedBannerProps {
  /** What is unavailable, in the user's terms. */
  title: string
  /** One or two sentences: which key unlocks it, and what still works today. */
  body: ReactNode
  /** Deep link to the exact provider card, e.g. `/settings#jsearch`. */
  settingsHref: string
}

export function DegradedBanner({ title, body, settingsHref }: DegradedBannerProps) {
  return (
    <div
      data-testid="degraded-banner"
      className="flex items-center gap-3.5 rounded-lg border border-warn/30 bg-warn-bg px-4 py-3.5"
    >
      <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-warn" />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>

      <Link
        href={settingsHref}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
      >
        Open Settings →
      </Link>
    </div>
  )
}
