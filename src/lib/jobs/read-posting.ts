/**
 * Reads role, company and location out of a pasted job posting — with no key,
 * no network and no model.
 *
 * The case this exists for is a posting hunt cannot fetch: Work at a Startup and
 * Workday sit behind a login, plenty of company career pages are neither a board
 * nor worth a Firecrawl call, and a description forwarded by mail has no URL at
 * all. Before this, all three meant retyping the two fields the text already
 * states and pasting the description into the smallest box on the form.
 *
 * **It prefills; it never decides.** Every field lands in an input the user can
 * see and correct before anything is written, and a rule that is not confident
 * returns null rather than guessing. That asymmetry is deliberate: a blank Company
 * costs one word of typing, while a wrong one is quoted back in a cover letter
 * addressed to the wrong firm. The same reasoning is why hunt refused to invent a
 * description for a posting it could not read.
 *
 * The pasted text itself is never touched — it is stored verbatim as `jdText`,
 * because that is the evidence tailoring and the checks cite later. Nothing here
 * rewrites, summarises or trims it.
 *
 * Rules run most-explicit first: a labelled field beats "Title at Company", which
 * beats position in the document. Each is written to fail closed.
 */

export interface PostingFields {
  title: string | null
  company: string | null
  location: string | null
}

/** A heading longer than this is prose that happens to sit on line one. */
const MAX_FIELD_CHARS = 90

/** Meta lines pack several facts onto one row: "Firecrawl · Remote · Full-time". */
const SEGMENT = /\s*[·•|]\s*|\s+[—–]\s+/

const LABELS: Record<keyof PostingFields, RegExp> = {
  title: /^(?:job\s+)?(?:title|role|position)\s*[:\-–]\s*(.+)$/i,
  company: /^(?:company|employer|organisation|organization)\s*[:\-–]\s*(.+)$/i,
  location: /^(?:location|based\s+in|office)\s*[:\-–]\s*(.+)$/i,
}

/** "Senior AI Engineer, Tools & Agents at Twelve Labs" — the commonest single-line shape. */
const TITLE_AT_COMPANY = /^(.{3,}?)\s+at\s+(.{2,})$/i

/**
 * Remote/hybrid wording, or a "City, ST" pair. Deliberately narrow — "Cambridge,
 * United Kingdom" is not matched, because the pattern that would catch it also
 * catches "Engineering, Product" and a wrong location is worse than an empty one.
 */
const REMOTE = /^(?:fully\s+|100%\s+)?(?:remote|hybrid|on-?site|in-?office)\b.{0,40}$/i
const CITY_STATE = /^[A-Z][A-Za-z.'’\- ]{1,40},\s*(?:[A-Z]{2}|[A-Z][a-z]{2,})$/

/** Employment terms and the like share meta lines with the location; they are not one. */
const NOT_A_LOCATION = /^(?:full|part)[\s-]?time$|^contract$|^intern(ship)?$|^\$|^[\d,]+\s*[-–]/i

function clean(value: string): string | null {
  const trimmed = value.trim().replace(/[.,;:]+$/, '').trim()
  if (!trimmed || trimmed.length > MAX_FIELD_CHARS) return null
  // A line with sentence punctuation inside it is prose, not a field.
  if (/[.!?]\s+\S/.test(trimmed)) return null
  return trimmed
}

/**
 * Guards the *positional* company rule only — the line under the role is as
 * often the opening of the description as it is a name. Company names are short
 * ("Exa", "Twelve Labs", "Bank of America Merrill Lynch" is five words and an
 * outlier); a clause is not. A labelled `Company:` skips this, because there the
 * user's own document has already answered the question.
 */
function looksLikeName(value: string): boolean {
  return value.length <= 50 && value.split(/\s+/).length <= 5
}

function looksLikeLocation(value: string): boolean {
  if (NOT_A_LOCATION.test(value)) return false
  return REMOTE.test(value) || CITY_STATE.test(value)
}

export function readPosting(text: string): PostingFields {
  const found: PostingFields = { title: null, company: null, location: null }
  if (!text.trim()) return found

  // Only the head of the document. Postings restate the company in the boilerplate
  // at the bottom and name every office they have; the top is where the answer is.
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)

  const unlabelled: string[] = []

  for (const line of lines) {
    let labelled = false
    for (const field of ['title', 'company', 'location'] as const) {
      const match = LABELS[field].exec(line)
      if (!match) continue
      labelled = true
      found[field] ??= clean(match[1]!)
    }
    if (!labelled) unlabelled.push(line)
  }

  // Segments of the head, so "Firecrawl · San Francisco, CA · Full-time" gives up
  // its location without the whole row being mistaken for one.
  if (!found.location) {
    for (const segment of unlabelled.flatMap((line) => line.split(SEGMENT))) {
      const value = clean(segment)
      if (value && looksLikeLocation(value)) {
        found.location = value
        break
      }
    }
  }

  const headings = unlabelled.filter(
    (line) => !line.split(SEGMENT).every((segment) => looksLikeLocation(segment.trim())),
  )

  if (!found.title || !found.company) {
    const first = headings[0] ? clean(headings[0].split(SEGMENT)[0]!) : null
    const pair = first ? TITLE_AT_COMPANY.exec(first) : null

    if (pair) {
      found.title ??= clean(pair[1]!)
      found.company ??= clean(pair[2]!)
    } else {
      found.title ??= first
      // The line under the role, when it is short enough to be a name rather than
      // the opening of the description. `headings[1]` may well be prose; `clean`
      // is what rejects it.
      const second = headings[1] ? clean(headings[1].split(SEGMENT)[0]!) : null
      found.company ??= second && looksLikeName(second) ? second : null
    }
  }

  return found
}
