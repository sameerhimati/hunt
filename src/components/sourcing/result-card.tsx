'use client'

import { useId, useState } from 'react'

import { FitTierBadge } from '@/components/fit-tier-badge'
import { WhyItFits } from '@/components/sourcing/why-it-fits'
import type { SourcedResult } from '@/lib/sourcing/types'
import { cn } from '@/lib/utils'

/**
 * One search result, per `design/Sourcing.dc.html`: company tile, role + fit
 * badge on one line, a muted metadata line, and the pull-in on the right.
 *
 * `result.rating` is optional by design: cards arrive from the boards
 * immediately and the fit tier fills in when the batch rating returns. An
 * unrated card renders with no badge and no "Why it fits" — it never guesses a
 * tier to fill the space, and there is no number anywhere on it.
 *
 * The tier changes the card's weight, not its contents. Strong gets the filled
 * button, Reach dims to 82% and takes the outline — the ranking is expressed in
 * emphasis rather than in a fake ordinal, and every card keeps the same one
 * click into the pipeline.
 *
 * Required testids: `sourcing-result` (the card root, one per result),
 * `why-it-fits-toggle`, `pull-into-pipeline` — all inside this card's subtree,
 * because the e2e gate scopes them to a single result.
 */
export interface ResultCardProps {
  result: SourcedResult
  onPull: (result: SourcedResult) => void
  /** This card's pull is in flight. */
  pulling: boolean
}

/** "posted 2d ago" — the mockup's phrasing, coarse on purpose. */
function postedAgo(postedAt: Date, now = Date.now()): string | null {
  const ms = now - postedAt.getTime()
  if (!Number.isFinite(ms) || ms < 0) return null

  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'posted just now'
  if (hours < 24) return `posted ${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `posted ${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `posted ${weeks}w ago`
  return `posted ${Math.floor(days / 30)}mo ago`
}

/** The monogram in the company tile. */
function monogram(company: string): string {
  const letter = company.trim().match(/[\p{L}\p{N}]/u)
  return letter ? letter[0].toUpperCase() : '·'
}

export function ResultCard({ result, onPull, pulling }: ResultCardProps) {
  const [open, setOpen] = useState(false)
  const blockId = useId()
  const { listing, rating } = result

  const strong = rating?.tier === 'strong'
  const posted = listing.postedAt ? postedAgo(listing.postedAt) : null
  const reasons = rating?.reasons ?? []

  return (
    <div
      data-testid="sourcing-result"
      className={cn(
        'rounded-[11px] border border-border bg-card px-[18px] py-4',
        rating?.tier === 'reach' && 'opacity-[0.82]',
      )}
    >
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-[9px] bg-surface-2 font-serif text-[17px]"
        >
          {monogram(listing.company)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              className="text-[14.5px] font-semibold hover:underline"
            >
              {listing.title}
            </a>
            {rating ? <FitTierBadge tier={rating.tier} reasons={reasons} /> : null}
          </div>

          <p className="mt-[3px] text-[12.5px] text-muted-foreground">
            {listing.company}
            {listing.location ? ` · ${listing.location}` : ''}
            {posted ? ` · ${posted}` : ''}
            {' · '}
            <span className="font-mono text-[11px] text-faint">{listing.source}</span>
          </p>

          {reasons.length > 0 ? (
            <button
              type="button"
              data-testid="why-it-fits-toggle"
              aria-expanded={open}
              aria-controls={blockId}
              onClick={() => setOpen((current) => !current)}
              className="label-mono mt-2 cursor-pointer transition-colors duration-150 hover:text-muted-foreground"
            >
              {open ? '▾' : '▸'} Why it fits
            </button>
          ) : null}
        </div>

        <button
          type="button"
          data-testid="pull-into-pipeline"
          disabled={pulling}
          onClick={() => onPull(result)}
          className={cn(
            'shrink-0 cursor-pointer rounded-[8px] px-3.5 py-2 text-[12px] transition-opacity duration-150 disabled:cursor-default disabled:opacity-60',
            strong
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'border border-border text-foreground',
          )}
        >
          {pulling ? 'Pulling…' : strong ? 'Pull into pipeline' : 'Pull in'}
        </button>
      </div>

      {open && reasons.length > 0 ? (
        <div id={blockId} className="mt-3 ml-[54px]">
          <WhyItFits reasons={reasons} />
        </div>
      ) : null}
    </div>
  )
}
