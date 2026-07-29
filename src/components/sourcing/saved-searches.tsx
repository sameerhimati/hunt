import { describeQuery, type JobQuery, type SavedSearch } from '@/lib/sourcing/types'

/**
 * The saved-search chip row from `design/Sourcing.dc.html`: a mono "SAVED"
 * label, one pill per stored query (the active one outlined in mint), and a
 * dashed "+ save this" chip at the end.
 *
 * Saved searches are the habit loop — a hunt is the same three queries re-run
 * every few days, so re-running one has to be a click, not a re-typed form.
 * The row renders whatever `saved` it is handed; the page reads that list from
 * storage on the server, so the chips survive a reload rather than living in
 * client memory.
 *
 * Required testids: `saved-search-chip` (one per stored query, labelled so
 * `hasText: 'platform'` finds it), `save-search` (the + save this chip).
 */
export interface SavedSearchesProps {
  saved: SavedSearch[]
  /** The chip whose query is currently on screen, or null after a fresh search. */
  activeId: string | null
  onRun: (id: string) => void
  onSave: () => void
  onDelete: (id: string) => void
  /**
   * The query in the search bar right now. Optional: without it the save chip
   * stays enabled and the server rejects the duplicate. With it, saving an
   * empty or already-saved query is disabled before the click.
   */
  query?: JobQuery
}

const CHIP = 'rounded-full border px-3 py-1 text-sm transition-colors'

/** Nothing to keep: an empty query is a chip that says "any role" a week later. */
function isEmpty(query: JobQuery): boolean {
  return !query.keywords.trim() && !query.location?.trim() && !query.remoteOnly
}

export function SavedSearches({
  saved,
  activeId,
  onRun,
  onSave,
  onDelete,
  query,
}: SavedSearchesProps) {
  // Chips are compared by what they say, not by id — the same query typed twice
  // is the same saved search, whichever route it arrived by.
  const labels = new Set(saved.map((search) => describeQuery(search.query)))
  const canSave = query ? !isEmpty(query) && !labels.has(describeQuery(query)) : true

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label-mono">Saved</span>

      {saved.map((search) => {
        const active = search.id === activeId
        // Rendered from the stored query, not the stored label: the chip has to
        // read as the query it will re-run, verbatim.
        const label = describeQuery(search.query)

        return (
          <span key={search.id} className="group relative inline-flex items-center">
            <button
              type="button"
              data-testid="saved-search-chip"
              aria-pressed={active}
              onClick={() => onRun(search.id)}
              className={`${CHIP} ${
                active
                  ? 'border-primary bg-surface-2 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>

            {/* No confirm dialog: deleting a chip loses one line of text, and
                re-saving the query puts it straight back. */}
            <button
              type="button"
              data-testid="delete-saved-search"
              aria-label={`Delete saved search ${label}`}
              title="Delete — re-save the query to bring it back"
              onClick={() => onDelete(search.id)}
              className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-surface-2 text-xs leading-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
            >
              ×
            </button>
          </span>
        )
      })}

      <button
        type="button"
        data-testid="save-search"
        disabled={!canSave}
        onClick={onSave}
        className={`${CHIP} border-dashed border-border text-primary disabled:pointer-events-none disabled:opacity-40`}
      >
        + save this
      </button>
    </div>
  )
}
