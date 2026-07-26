import { KeyRound } from 'lucide-react'
import Link from 'next/link'

import type { ProviderCategory } from '@/lib/providers/types'
import { cn } from '@/lib/utils'

/**
 * The key-missing state, designed rather than hidden (DESIGN §6.2, §8).
 *
 * Three jobs, in this order: name the exact key the feature needs, say what
 * still works without it, and hand over a deep link to the Settings card that
 * fixes it. The gated feature stays on screen — a feature that vanishes when a
 * key is missing teaches the user that hunt is broken; one that says what it
 * needs teaches them what to add.
 *
 * No nagging, no "upgrade", no red. Amber is a state, not a scolding.
 */
interface DegradedBannerProps {
  /** What is gated, in the user's words — "Tailoring". */
  feature: string
  /** The key it needs — "an LLM key (Anthropic or an OpenAI-compatible endpoint)". */
  needs: string
  /** What is still available meanwhile. The keyless floor is a product promise. */
  stillWorks: string
  /** Which Settings section the link lands on. */
  settingsSection: ProviderCategory
  className?: string
}

export function DegradedBanner({
  feature,
  needs,
  stillWorks,
  settingsSection,
  className,
}: DegradedBannerProps) {
  return (
    <div
      data-testid="degraded-banner"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-warn/40 bg-warn-bg px-4 py-3',
        className,
      )}
    >
      <KeyRound size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />

      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        <p className="text-warn">
          <span className="font-medium">
            {feature} needs {needs}.
          </span>
        </p>
        <p className="mt-1 text-muted-foreground">{stillWorks}</p>

        <Link
          href={`/settings#section-${settingsSection}`}
          data-testid="degraded-banner-link"
          className="mt-2 inline-block font-mono text-xs text-warn underline underline-offset-2 hover:text-foreground"
        >
          Add the key in Settings →
        </Link>
      </div>
    </div>
  )
}
