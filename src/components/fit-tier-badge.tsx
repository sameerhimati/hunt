'use client'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { isFitTier, type FitTier } from '@/lib/db/enums'
import type { FitReason } from '@/lib/fit/rate'
import { cn } from '@/lib/utils'

/**
 * Strong / Possible / Reach — the whole fit vocabulary, and the only thing hunt
 * ever says about how well a job matches you.
 *
 * There is nothing to render but a tier: the prop is a `FitTier`, `FitRating`
 * has no score field (`src/lib/fit/rate.ts`), and reasons are sentences. A
 * percentage cannot appear here without someone first widening a type whose
 * whole purpose is to refuse one.
 *
 * Reasons are surfaced on hover because a verdict the user can't interrogate is
 * the one thing this product never ships — the badge is the glance, the card's
 * "Why it fits" block is the full reading.
 *
 * Shared with the application match-rating panel, so it takes a tier and its
 * reasons and nothing else: no listing, no layout opinions.
 *
 * Required testid: `fit-tier-badge`.
 */
export interface FitTierBadgeProps {
  tier: FitTier
  /** Shown on hover. Omitted or empty ⇒ a plain badge, no hover card. */
  reasons?: FitReason[]
  className?: string
}

/** Mockup copy (`design/Sourcing.dc.html`): "Strong fit", then bare nouns. */
const TIER_LABEL: Record<FitTier, string> = {
  strong: 'Strong fit',
  possible: 'Possible',
  reach: 'Reach',
}

const TIER_TONE: Record<FitTier, string> = {
  strong: 'text-diff-add bg-diff-add-bg',
  possible: 'text-warn bg-warn-bg',
  reach: 'text-muted-foreground bg-surface-2',
}

export function FitTierBadge({ tier, reasons, className }: FitTierBadgeProps) {
  // Unrated renders nothing at all — a fourth "Unrated" pill would be a tier the
  // model never assigned, sitting in the same slot as ones it did.
  if (!isFitTier(tier)) return null

  const badge = (
    <span
      data-testid="fit-tier-badge"
      className={cn(
        'inline-block shrink-0 rounded-[5px] px-2 py-0.5 text-[10.5px] leading-[1.5] font-semibold',
        TIER_TONE[tier],
        className,
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  )

  const shown = reasons?.filter((reason) => reason.text.trim().length > 0) ?? []
  if (shown.length === 0) return badge

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <p className="label-mono mb-1.5">Why {TIER_LABEL[tier].toLowerCase()}</p>
        <ul className="flex flex-col gap-1.5 text-xs leading-snug">
          {shown.map((reason, index) => (
            <li key={index} className="flex gap-2">
              <span className={reason.gap ? 'text-warn' : 'text-diff-add'} aria-hidden>
                {reason.gap ? '~' : '+'}
              </span>
              <span>{reason.text}</span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}
