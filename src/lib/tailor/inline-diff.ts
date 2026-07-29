/**
 * Word-level inline diff — the "what actually moved" instrument inside a
 * DiffRow (TAILORING-DIFF §3.2).
 *
 * Two decisions are load-bearing:
 *
 *  1. **Word-level, never character-level.** `Cut` → `Cutting` reads as one
 *     word replaced, not as `Cut` plus a highlighted `ting`. Character diffs
 *     look clever and are unreadable in a serif document voice, and they make a
 *     reviewer trust a change they have not actually read.
 *  2. **Highlighting is word-level; the decision stays per row** (§3.1). This
 *     function only says which words differ. Nothing here accepts anything, so
 *     there is no path to a Frankenstein bullet assembled out of half a hunk.
 *
 * This is *not* `src/lib/resume/diff.ts`, which compares two versions of a
 * résumé and answers "which fields changed". This compares two strings and
 * answers "which words changed" — a different job at a different altitude, and
 * merging them would give one function two vocabularies.
 *
 * Fidelity contract: the non-whitespace tokens of the `same` + `del` segments
 * reproduce `was` exactly, and `same` + `add` reproduce `now` exactly. Only
 * whitespace is repositioned — a highlight is trimmed so it hugs its words
 * rather than swallowing the gap next to it, which is how the mockup renders
 * and how the eye finds the edit.
 */

export type InlineDiffType = 'same' | 'add' | 'del'

export interface InlineDiffSegment {
  type: InlineDiffType
  /** Verbatim source text — render it, never re-tokenize it. */
  text: string
}

/**
 * Whitespace runs · words · everything else, one character at a time.
 *
 * A word absorbs the punctuation that lives *inside* it (`p99`, `38%`,
 * `co-founder`, `and/or`, `U.S`) but not the punctuation that ends it, so
 * `org.` → `org` + `.` and rewording a sentence never highlights the full stop
 * it kept.
 */
const TOKEN = /\s+|[\p{L}\p{N}]+(?:['’\-/.][\p{L}\p{N}]+)*%?|[^\s]/gu

/**
 * Above this the quadratic LCS stops being free and the row stops being
 * reviewable anyway — a change that large is a rewrite, and it reads better as
 * one struck block against one new block than as confetti.
 */
const MAX_TOKENS = 800

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

function isBlank(text: string): boolean {
  return text.trim().length === 0
}

/** Classic LCS backtrace, emitting deletions before additions at a swap. */
function diffTokens(a: string[], b: string[]): InlineDiffSegment[] {
  const width = b.length + 1
  // dp[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const dp = new Uint32Array((a.length + 1) * width)

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }

  const raw: InlineDiffSegment[] = []
  let i = 0
  let j = 0

  // Runs are merged as they are emitted: a deleted phrase is one highlight,
  // and the spaces inside it belong to the phrase, not between two highlights.
  const emit = (type: InlineDiffType, token: string) => {
    const last = raw.at(-1)
    if (last && last.type === type) last.text += token
    else raw.push({ type, text: token })
  }

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      emit('same', a[i])
      i++
      j++
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      emit('del', a[i])
      i++
    } else {
      emit('add', b[j])
      j++
    }
  }

  for (; i < a.length; i++) emit('del', a[i])
  for (; j < b.length; j++) emit('add', b[j])

  return raw
}

/**
 * Merges token runs into segments and pushes whitespace out of the highlighted
 * ones, so a deletion is struck through across its words and not across the
 * space that follows them.
 */
function coalesce(raw: readonly InlineDiffSegment[]): InlineDiffSegment[] {
  const out: InlineDiffSegment[] = []

  const push = (type: InlineDiffType, text: string) => {
    if (!text) return

    const last = out.at(-1)

    // A gap evicted from a highlight is only a gap; two of them in a row (one
    // from the deletion, one from the insertion that replaced it) are still
    // one space between the two blocks.
    if (type === 'same' && isBlank(text) && last && /\s$/.test(last.text)) return

    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }

  for (const segment of raw) {
    if (segment.type === 'same') {
      push('same', segment.text)
      continue
    }

    const lead = /^\s*/.exec(segment.text)?.[0] ?? ''
    const trail = segment.text.length > lead.length ? (/\s*$/.exec(segment.text)?.[0] ?? '') : ''
    const core = segment.text.slice(lead.length, segment.text.length - trail.length)

    push('same', lead)
    push(segment.type, core)
    push('same', trail)
  }

  return out
}

/**
 * Word-level diff between the original text and the proposed one.
 *
 * `was` is absent on an addition and `now` on a removal; both are honest
 * inputs, not error cases, and each yields a single segment of the right type.
 */
export function inlineDiff(
  was: string | null | undefined,
  now: string | null | undefined,
): InlineDiffSegment[] {
  const before = was ?? ''
  const after = now ?? ''

  if (before === after) return before ? [{ type: 'same', text: before }] : []
  if (!before) return [{ type: 'add', text: after }]
  if (!after) return [{ type: 'del', text: before }]

  const a = tokenize(before)
  const b = tokenize(after)

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { type: 'del', text: before },
      { type: 'add', text: after },
    ]
  }

  return coalesce(diffTokens(a, b))
}
