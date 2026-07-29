'use client'

import type { KeyboardEvent } from 'react'

import { Switch } from '@/components/ui/switch'
import type { JobQuery } from '@/lib/sourcing/types'

/**
 * The search row from `design/Sourcing.dc.html`: keyword field (flex 2),
 * location field (flex 1), a Remote toggle, and the Search button.
 *
 * Controlled input — the workspace owns the query so a saved-search chip can
 * populate the row without this component knowing chips exist.
 *
 * Required testids: `search-keywords` (keyword input), `search-jobs` (button).
 */
export interface SearchBarProps {
  value: JobQuery
  onChange: (next: JobQuery) => void
  onSearch: () => void
  /** A search is in flight: disable the button and say so, don't spin silently. */
  searching: boolean
}

/** The mockup's field shell — one box shared by the keyword, location and Remote cells. */
const FIELD = 'flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5'
const TEXT_INPUT = 'w-full bg-transparent text-base outline-none placeholder:text-faint'

export function SearchBar({ value, onChange, onSearch, searching }: SearchBarProps) {
  // Enter is how people search; the button is for the mouse.
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!searching) onSearch()
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={searching}>
      {/* The fields are never disabled mid-search: refining the query while the
          boards answer is the common case, and a frozen input loses the typing. */}
      <div className={`${FIELD} flex-2 basis-64`}>
        <span aria-hidden className="font-mono text-faint">
          ⌕
        </span>
        <input
          data-testid="search-keywords"
          value={value.keywords}
          placeholder="Role, skills, or a phrase"
          aria-label="Keywords"
          onChange={(event) => onChange({ ...value, keywords: event.target.value })}
          onKeyDown={submitOnEnter}
          className={TEXT_INPUT}
        />
      </div>

      <div className={`${FIELD} flex-1 basis-40`}>
        <input
          data-testid="search-location"
          value={value.location ?? ''}
          placeholder="Location"
          aria-label="Location"
          onChange={(event) => onChange({ ...value, location: event.target.value })}
          onKeyDown={submitOnEnter}
          className={TEXT_INPUT}
        />
      </div>

      <label className={`${FIELD} cursor-pointer text-base select-none`}>
        <Switch
          data-testid="search-remote"
          aria-label="Remote only"
          checked={value.remoteOnly ?? false}
          onCheckedChange={(checked) => onChange({ ...value, remoteOnly: checked })}
        />
        Remote
      </label>

      <button
        type="button"
        data-testid="search-jobs"
        disabled={searching}
        onClick={onSearch}
        className="rounded-lg bg-primary px-5 py-2.5 text-base font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
      >
        {searching ? 'Searching…' : 'Search'}
      </button>
    </div>
  )
}
