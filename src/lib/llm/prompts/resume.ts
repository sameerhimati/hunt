import type { LlmSystemBlock } from '../types'

/**
 * `kind:parse_resume` — the PDF-import prompt (Phase 1).
 *
 * The bar the exit gate holds this to is ≥95% field recall, and the way to hit
 * it is not cleverness but discipline: copy text verbatim, never summarise,
 * never invent, and say nothing about fields the document doesn't have. A model
 * that "improves" a bullet during import silently corrupts the user's own
 * history, which is worse than dropping it.
 */

const SCHEMA_SKETCH = `{
  "basics": { "name", "label", "email", "phone", "url", "location", "summary" },
  "experience": [ { "company", "title", "location", "start", "end", "bullets": [] } ],
  "education":  [ { "institution", "degree", "location", "start", "end", "bullets": [] } ],
  "skills":     [ { "category", "items": [] } ],
  "projects":   [ { "name", "description", "url", "bullets": [] } ],
  "custom":     [ { "title", "bullets": [] } ]
}`

export const PARSE_RESUME_SYSTEM = `You convert the plain text of a résumé PDF into structured JSON.

Return ONLY a JSON object, no prose and no code fences, in this shape:
${SCHEMA_SKETCH}

Rules:
- Copy every string VERBATIM from the résumé. Do not rewrite, summarise, translate,
  fix grammar, expand abbreviations, or change punctuation or capitalisation.
- Omit a key entirely when the résumé does not state it. Never guess a value.
- "label" is the headline under the name (e.g. "Backend Engineer"), not a job title
  from the experience section.
- "summary" is the profile/summary paragraph, if there is one.
- Dates: normalise to "YYYY-MM" when a month is given ("Mar 2023" -> "2023-03",
  "03/2023" -> "2023-03") and "YYYY" when only a year is given. A date already
  written as "YYYY-MM" stays exactly as it is. For a current role set "end" to null.
- Bullets are the individual bullet lines of an entry, in document order, with the
  bullet glyph and any trailing period-less formatting removed but the words intact.
- Skills grouped under a label become one entry per label ("Languages", "Infrastructure").
  Ungrouped skills become a single group with category "Skills".
- Sections that fit none of the above (awards, talks, publications) go in "custom".`

/** The frozen prefix — identical on every import, so it caches. */
export function parseResumeSystem(): LlmSystemBlock[] {
  return [{ text: PARSE_RESUME_SYSTEM, cache: true }]
}

export function parseResumeMessage(resumeText: string): string {
  return `Résumé text extracted from the PDF:\n\n---\n${resumeText}\n---\n\nReturn the JSON object.`
}
