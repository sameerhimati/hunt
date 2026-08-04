import {
  parseResumeContent,
  type CustomSection,
  type EducationEntry,
  type ExperienceEntry,
  type ProjectEntry,
  type ResumeContent,
  type SkillGroup,
} from '../schema'

import type { SourceDocument, SourceLine } from './blocks'

/**
 * The keyless structurer — typography and vocabulary in, `ResumeContent` out.
 *
 * Importing a résumé used to require an LLM key, which made a key the price of
 * the very first action a new user takes. It never needed to be: a résumé is a
 * *typeset* document, and the typesetting is the structure. The name is the
 * biggest thing on page one. Section headings are the short lines set apart from
 * the body. Bullets carry a glyph. Dates sit right-aligned against their
 * employer or out in the margin. None of that needs a model — it needs the
 * layout, which is why this consumes `SourceLine[]` from `./blocks` rather than
 * the flat text layer `../import.ts` extracts. Flat text is where the structure
 * has already been destroyed.
 *
 * **The one rule: this function never authors a string.** Every value it emits is
 * a verbatim span of the user's document; the only transformation allowed is date
 * normalisation ("Jun 2021" → "2021-06"), which `scoreConfidence()` in
 * `../import.ts` tolerates for `start`/`end` and for nothing else. That is not a
 * style preference — it is the honesty invariant the tailoring validator enforces
 * (`lib/tailor/validator.ts`) read at the import boundary: hunt does not put a
 * claim in your résumé that you did not write. So when a heuristic cannot resolve
 * a field, the field is **left empty**. A blank on the review screen costs the
 * user ten seconds; a plausible wrong value costs them the ten seconds *plus*
 * having to notice it first, and if they don't notice, it costs them the claim.
 * Segmenting a document is allowed. Composing prose about it is not.
 *
 * It also **never throws**. The input is a stranger's PDF, and the worst honest
 * outcome is a partial draft — a form with four of nine fields filled is a better
 * start than an empty one and a far better one than an error page. This function
 * has no failure mode except "returned less".
 *
 * Two signals, never one. Typography alone mistakes a bolded company name for a
 * heading: sample 3 sets "Grubhub" and "Education" in the very same font at the
 * very same 9.96pt. Vocabulary alone cannot find the sections real résumés invent
 * ("Speaking"), and finds nothing at all in a document whose headings are ALL
 * CAPS body text. Used together each covers the other's blind spot — vocabulary
 * anchors *which* styles are heading styles, and the style then finds the
 * headings vocabulary has never heard of.
 *
 * What this file may assume about its input, because `./blocks` guarantees it:
 * `lines` is in **human reading order** with two-column layouts already resolved
 * and split at the gutter, bullet glyphs already stripped into `isListItem`, and
 * bullet geometry measured from the text rather than the hanging glyph. It must
 * not re-order, re-cluster or second-guess any of that.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

type SectionKind = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'custom'

/**
 * Section names, as headings rather than as words. Every pattern is anchored to
 * the **whole line**: an unanchored /experience/ turns "Experience building batch
 * pipelines" in a summary paragraph into a section break, and the résumés that
 * phrase it that way are not rare.
 */
const SECTION_VOCABULARY: ReadonlyArray<readonly [Exclude<SectionKind, 'custom'>, RegExp]> = [
  ['summary', /^(?:summary|profile|about(?: me)?|objective|overview|professional summary|career (?:summary|objective))$/],
  ['experience', /^(?:experience|work experience|employment|employment history|work history|professional experience|relevant experience|career history)$/],
  ['education', /^(?:education|education (?:and|&) training|academic background|academics)$/],
  ['skills', /^(?:skills|technical skills|core skills|skills (?:and|&) (?:tools|technologies)|technologies|core competencies)$/],
  ['projects', /^(?:projects|personal projects|selected projects|side projects|open source(?: projects)?)$/],
]

/**
 * Words that make a span a job title rather than an employer. This is what
 * resolves "Company Title" against "Title, Company" without guessing from
 * position: the layouts in the corpus disagree about order (sample 1 writes
 * "Convoy" then "Senior Data Engineer", sample 2 writes "Staff Site Reliability
 * Engineer, Bazaarvoice") but they agree that only one side of the pair names a
 * *role*. Matched on word boundaries, so "Engineering" in a degree name does not
 * count and an employer has to contain a role word standing alone to be mistaken
 * for one.
 */
const TITLE_WORDS =
  /\b(?:engineer|developer|manager|scientist|analyst|designer|director|architect|consultant|specialist|administrator|lead|intern|president|founder|owner|officer|head|coordinator|technician|researcher|programmer|strategist|recruiter|accountant|attorney|nurse|teacher|professor|writer|editor|producer|marketer|cto|ceo|cfo|coo|vp|svp|evp)\b/i

/** The same trick for education, where the pair is a degree and an institution. */
const DEGREE_WORDS =
  /(?:\bb\.?s\.?c?\b|\bb\.?a\.?\b|\bm\.?s\.?c?\b|\bm\.?a\.?\b|\bmba\b|\bph\.?d\.?\b|\bb\.?eng\b|\bm\.?eng\b|\bb\.?tech\b|\bbachelor|\bmaster|\bdoctorate\b|\bdiploma\b|\bcertificate\b)/i
const INSTITUTION_WORDS = /\b(?:university|college|institute|school|academy|polytechnic)\b/i

// ---------------------------------------------------------------------------
// Dates — the only values this file is allowed to rewrite
// ---------------------------------------------------------------------------

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** "Present" and its synonyms mean an absent `end`, which the schema reads as now. */
const OPEN_ENDED = /^(?:present|current|now|today|ongoing)$/i

const ENDPOINT =
  '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{4}' +
  '|\\d{4}-\\d{1,2}|\\d{1,2}/\\d{4}|\\d{4}/\\d{1,2}|\\d{4}' +
  '|present|current|now|today|ongoing'

/**
 * A date range, *searched for* anywhere in a line rather than matched against the
 * whole of one.
 *
 * That is not laziness — it is the only thing that reads both layouts in the
 * corpus with one rule. `./blocks` joins everything on a shared baseline into one
 * line, so sample 1's right-aligned date arrives fused to its employer
 * ("Convoy 2022-01 – Present") while sample 2's arrives alone on the line below
 * its title ("Jun 2021 – Present"). Searching finds it in both, and *subtracting
 * the matched span* leaves the employer behind — so this one regex is also the
 * company/date splitter, and it splits on the author's own characters instead of
 * on a guessed column position.
 */
const DATE_RANGE = new RegExp(
  `\\b(${ENDPOINT})\\s*(?:–|—|‒|-{1,2}|to|until|through)\\s*(${ENDPOINT})\\b`,
  'i',
)
const WHOLE_DATE = new RegExp(`^(?:${ENDPOINT})$`, 'i')

interface DateRange {
  start?: string
  end?: string
  /** The verbatim span the range occupied, so callers can subtract it. */
  span: string
}

/** `Jun 2021` → `2021-06`. Anything unrecognised returns undefined, not a guess. */
function normaliseDate(raw: string): string | undefined {
  const value = raw.trim()
  if (!value || OPEN_ENDED.test(value)) return undefined

  const named = value.match(/^([a-z]+)\.?\s+(\d{4})$/i)
  if (named) {
    const month = MONTHS[named[1].toLowerCase().slice(0, 3)]
    return month ? `${named[2]}-${month}` : named[2]
  }

  const iso = value.match(/^(\d{4})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`

  const slashed = value.match(/^(\d{1,2})\/(\d{4})$/)
  if (slashed) return `${slashed[2]}-${slashed[1].padStart(2, '0')}`

  const reversed = value.match(/^(\d{4})\/(\d{1,2})$/)
  if (reversed) return `${reversed[1]}-${reversed[2].padStart(2, '0')}`

  const year = value.match(/^(\d{4})$/)
  return year ? year[1] : undefined
}

function findDateRange(text: string): DateRange | null {
  const range = text.match(DATE_RANGE)
  if (range) {
    return { start: normaliseDate(range[1]), end: normaliseDate(range[2]), span: range[0] }
  }
  // A lone date counts only when it is the entire line. Unanchored, "40 teams"
  // and "from 4.1s to 1.6s" in bullet copy start looking like employment dates.
  const trimmed = text.trim()
  if (WHOLE_DATE.test(trimmed)) {
    return { start: normaliseDate(trimmed), end: undefined, span: trimmed }
  }
  return null
}

// ---------------------------------------------------------------------------
// Text shape predicates
// ---------------------------------------------------------------------------

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/

/**
 * Résumés write links bare. `github.com/you`, `linkedin.com/in/you`,
 * `yourname.com` — a scheme is what a browser needs, not what a person types on
 * a document meant to be read.
 *
 * Requiring `https://` or `www.` therefore missed the way the overwhelming
 * majority of contact lines are actually written, and it failed *twice* on the
 * same line: `isContactLine()` did not recognise the contact line as contact
 * information, so `parseBasics` took it for the first non-contact line and filed
 * the user's entire link list as their headline — while `basics.url` stayed
 * empty for want of a match. One missing alternative, two wrong fields, and the
 * headline is the more damaging of them because it is wrong rather than absent.
 *
 * The bare form is admitted through **an explicit TLD list** and not through
 * `\.\w{2,}`, which is the shape that would have to be right about prose it has
 * no business reading. `Node.js`, `Next.js`, `e.g.`, `U.S.` and `Ph.D.` all
 * survive a list that does not contain `js`, `g`, `s` or `d`; none of them
 * survives the general pattern. False negatives here cost a link the user can
 * paste back in ten seconds — a false positive silently eats a span of their
 * text, which is the error this file exists to avoid.
 *
 * `(?!-)` is there for `s3.us-east-1`. A TLD list long enough to be useful has
 * to contain short country codes, and a hyphen straight after one means the
 * match landed in the middle of an identifier rather than at the end of a host
 * name. AWS regions are the case that turns up in engineering bullets; the rule
 * is general.
 */
const TLD =
  'com|org|net|io|dev|ai|co|me|app|xyz|tech|info|edu|gov|us|uk|ca|de|fr|nl|in|au|' +
  'sh|gg|ly|so|to|cc|tv|fm|page|site|design|studio|blog|works|space|online'
const URL = new RegExp(
  `(?:https?://|www\\.)[^\\s|·•]+|\\b(?:[\\w-]+\\.)+(?:${TLD})\\b(?!-)(?:/[^\\s|·•]*)?`,
  'i',
)

const PHONE = /\+?\d[\d\s().-]{6,}\d/

/**
 * What a résumé puts between the parts of a contact line. No template agrees:
 * "·" in samples 1 and 3, "|" in sample 2, an em dash in the DOCX fixture, and
 * plenty use nothing but a run of spaces.
 */
const SEPARATORS = /[·•|–—]+|\s{2,}/
/** Separator debris left at the ends of a part once its neighbours are removed. */
const EDGE_PUNCTUATION = /^[\s,;:·•|–—-]+|[\s,;:·•|–—-]+$/g

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean)
}

/** The tail of a `City, ST` pair: a state code, or one capitalised word. */
const PLACE_TAIL = /^(?:\p{Lu}{2,3}|\p{Lu}[\p{Ll}.'-]+)$/u

/**
 * "Seattle, WA" but not "Staff Site Reliability Engineer, Bazaarvoice" — both are
 * `Something, Something`, and both turn up as a line of their own in this corpus.
 * The word ceiling is what separates them: place names are short ("San Francisco,
 * CA" is the long case, at three words) and role-and-employer pairs are not.
 * Deliberately conservative, because a location left empty costs the user one
 * field while a job title filed as a location costs them their trust in the
 * import.
 */
function isLocation(text: string): boolean {
  const value = text.trim()
  if (/^(?:remote|hybrid|onsite)$/i.test(value)) return true

  const parts = value.split(',')
  if (parts.length !== 2 || words(value).length > 3) return false
  if (!/^\p{Lu}/u.test(parts[0].trim())) return false
  return PLACE_TAIL.test(parts[1].trim())
}

/**
 * Peels a right-aligned location off the end of a fused line.
 *
 * `./blocks` joins a shared baseline into one string, which is right for
 * everything else and lossy here: "Senior Data Engineer" at the left margin and
 * "Seattle, WA" hard right arrive as `Senior Data Engineer Seattle, WA`, with the
 * gap that separated them collapsed to a single space. Three of three fixtures
 * need this line split, and there is no geometry left to split it on.
 *
 * So it is split on **vocabulary**, by trying the shortest city first and
 * accepting the first split whose *remainder still ends in a role word*. That
 * clause is the whole point. Without it, `Senior Data Engineer Seattle, WA`
 * splits happily at "Engineer Seattle, WA" and the user's title becomes "Senior
 * Data"; with it, one-word "Seattle" wins because "Senior Data Engineer" ends in
 * "Engineer". It also gets multi-word cities right for the same reason — "Senior
 * Engineer New York, NY" rejects "York" (remainder ends "New") and accepts "New
 * York".
 *
 * When no candidate satisfies the anchor, **nothing is split**: the whole span
 * stays in the field it came from and `location` is left empty. That is the
 * refusal this file is built around — a location is worth having, but not worth
 * cutting someone's job title in half for.
 */
function splitTrailingPlace(
  text: string,
  anchor: RegExp,
): { rest: string; location: string } | null {
  const comma = text.lastIndexOf(',')
  if (comma <= 0) return null

  const tail = text.slice(comma + 1).trim()
  if (!PLACE_TAIL.test(tail)) return null

  const head = words(text.slice(0, comma))
  for (let take = 1; take <= Math.min(3, head.length - 1); take += 1) {
    const city = head.slice(head.length - take)
    if (!city.every((word) => /^\p{Lu}/u.test(word))) break

    const rest = head.slice(0, head.length - take)
    const last = rest[rest.length - 1]
    if (last && anchor.test(last)) {
      return { rest: rest.join(' '), location: `${city.join(' ')}, ${tail}` }
    }
  }
  return null
}

/** A short capitalised label: a skill category, or a candidate custom heading. */
function isLabelish(text: string): boolean {
  const value = text.trim().replace(/:$/, '')
  if (!value || value.length > 34 || words(value).length > 3) return false
  if (/[,;:]/.test(value)) return false
  return /^[\p{Lu}\d]/u.test(value)
}

function styleOf(line: SourceLine): string {
  return `${line.fontName}@${line.fontSize.toFixed(1)}`
}

function matchVocabulary(line: SourceLine): Exclude<SectionKind, 'custom'> | null {
  if (line.isListItem) return null
  const value = line.text.toLowerCase().replace(/[:.]+$/, '').replace(/\s+/g, ' ').trim()
  if (!value || words(value).length > 4) return null
  for (const [kind, pattern] of SECTION_VOCABULARY) {
    if (pattern.test(value)) return kind
  }
  return null
}

// ---------------------------------------------------------------------------
// Wrapped bullets
// ---------------------------------------------------------------------------

/** Indents this close are the same indent; `x` carries sub-point float noise. */
const INDENT_TOLERANCE = 2

/**
 * How far right of its bullet a continuation may sit and still be one.
 *
 * Two bullet styles both occur, sometimes in the same document, and the
 * difference is not the author's — it is whether the typesetter emitted the
 * bullet glyph as its own text run:
 *
 *  - **Its own run.** `./blocks` drops it before measuring, so the bullet's `x`
 *    is where its *words* start and a wrap lands on precisely that number.
 *  - **Fused into the first run** (`"• Built document processing…"`). Nothing
 *    can be dropped before measuring, so `x` is where the *glyph* sits — a dozen
 *    points left of the words — while the wrap still aligns with the words.
 *
 * So the old test, exact equality with the bullet's `x`, silently held only for
 * the first style. This band accepts both: a continuation is level with its
 * bullet or a little right of it, never left. Twenty-four points is about two
 * ems at résumé body size — wide enough for any hanging indent, and nowhere near
 * the ~200pt jump between the columns of a two-column layout, which is the
 * neighbouring line this must never swallow.
 */
const MAX_CONTINUATION_INDENT = 24

/** Two lines are the same size when they round to the same tenth of a point. */
const FONT_SIZE_TOLERANCE = 0.5

/**
 * Re-joins bullets the typesetter broke across lines, before anything else runs.
 *
 * "…by rewriting the on-call" / "runbooks around service ownership" is one bullet
 * in two pieces, and a résumé that imports it as two bullets is visibly wrong on
 * the review screen. Doing it here, as a pass over the line list, rather than
 * inside the bullet collector is what keeps the rest of the file simple: a
 * continuation is a *non-bullet line in the middle of a bullet run*, so every
 * downstream rule that treats "a non-bullet line after bullets" as the start of
 * the next entry would otherwise have to know about wrapping too.
 *
 * The test is that the line **starts level with its bullet or a little right of
 * it, never left**, at the same type size, and carries no glyph of its own.
 * Left is what rules out the next entry's heading, which outdents — sample 2's
 * next job title sits at 162.9 against its bullets' 174.9, twelve points left,
 * and sample 3's at 235.8 against 245.8. Right is what admits a hanging indent
 * whose bullet glyph was fused into the first text run, where `x` measures the
 * glyph rather than the words (see `MAX_CONTINUATION_INDENT`).
 *
 * It was exact equality until 2026-08-03, which was a rule fitted to the three
 * sample PDFs rather than to how PDFs are built: every one of them happened to
 * emit the bullet as its own run. The first real-world résumé through this path
 * did not, and a whole entry's bullets shredded into phantom company and title
 * fields — the geometry was reporting the margin, not the text.
 *
 * **PDF only.** A DOCX "line" is a paragraph — logical, not visual — so a
 * 200-character bullet arrives whole and there is nothing to rejoin. Worse, the
 * rule actively misfires there: an ordinary body paragraph following a list shares
 * that list's indent (both are `x: 0` in the real fixture), so it would be glued
 * onto the last bullet. A rule that cannot fire correctly on a source must not run
 * on it.
 */
function rejoinWrappedBullets(doc: SourceDocument): SourceLine[] {
  const lines = doc.lines.filter((line) => line.text.trim() !== '')
  if (doc.kind !== 'pdf') return lines

  const joined: SourceLine[] = []
  let anchor: SourceLine | null = null

  for (const line of lines) {
    if (line.isListItem) {
      const copy = { ...line }
      joined.push(copy)
      anchor = copy
      continue
    }

    const indent = anchor === null ? 0 : line.x - anchor.x

    const continues =
      anchor !== null &&
      line.page === anchor.page &&
      indent >= -INDENT_TOLERANCE &&
      indent <= MAX_CONTINUATION_INDENT &&
      // Size, not face. One sentence of a bullet routinely spans three font
      // objects — a bold term, an italic product name, the roman around them —
      // so equality of `fontName` fails on any bullet with inline emphasis,
      // which is most of them. Size is what actually separates body text from
      // the heading this guard exists to keep out.
      Math.abs(line.fontSize - anchor.fontSize) <= FONT_SIZE_TOLERANCE &&
      findDateRange(line.text) === null &&
      // A named section heading is never the tail of a bullet, whatever the
      // geometry says. On a document with one font and one indent — the flat text
      // layer this file has to survive — "Education" following the last bullet of
      // the experience section satisfies every other test here, and absorbing it
      // costs the user the entire education section, not just one bullet.
      matchVocabulary(line) === null

    if (continues && anchor) {
      anchor.text = joinWrapped(anchor.text, line.text)
      continue
    }

    joined.push(line)
    anchor = null
  }

  return joined
}

/**
 * Joins a wrapped line to the one above it.
 *
 * A soft hyphen has to be removed rather than kept, and the halves closed up with
 * no space: `SourceDocument.text` is dehyphenated but `lines[].text` is not, so
 * "customer-visible down-" + "time" has to become "downtime" to still be a
 * verbatim substring of the haystack `scoreConfidence()` checks against. Same test
 * as `../import.ts` uses — a lowercase letter before the hyphen and a lowercase
 * letter after it, which is the signal that the break is hyphenation and not a
 * real compound, because "on-call" never wraps as "on-" / "Call".
 */
function joinWrapped(head: string, tail: string): string {
  if (/\p{Ll}-$/u.test(head) && /^\p{Ll}/u.test(tail)) return `${head.slice(0, -1)}${tail}`
  return `${head} ${tail}`
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface Section {
  kind: SectionKind
  /** The verbatim heading text — a `custom` section's title comes from here. */
  title: string
  lines: SourceLine[]
}

/**
 * Which (font, size) pairs are heading styles, and therefore which unrecognised
 * lines are headings of sections we have no vocabulary for.
 *
 * The set is *learned from the document* rather than assumed. Whatever style the
 * lines that do match the vocabulary are set in is this résumé's heading style,
 * and any other line wearing it is a heading too — which is how "Speaking" in
 * sample 3 becomes a `custom` section without anyone having had to anticipate the
 * word. Learning it also means the rule does not care *how* the heading is
 * distinct: sample 1 makes its headings bigger (11.96 against a 10.91 body) and
 * sample 3 makes them bold at exactly the same 9.96pt, and both arrive here as
 * simply "a different style from the body".
 *
 * The style is discarded when it is the document's most common one. That is the
 * case for a document with no usable font information — a flat text layer, a DOCX
 * with a single run style — where "the heading style" would match every line and
 * shatter the résumé into thirty empty sections. There, vocabulary works alone,
 * which is the right degradation: fewer sections found, none invented.
 */
function headingStyles(lines: SourceLine[]): Set<string> {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(styleOf(line), (counts.get(styleOf(line)) ?? 0) + 1)

  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const styles = new Set<string>()
  for (const line of lines) {
    if (matchVocabulary(line) && styleOf(line) !== dominant) styles.add(styleOf(line))
  }
  return styles
}

/**
 * Is this line a section heading we have no name for?
 *
 * Heading style is necessary and nowhere near sufficient. Sample 3 sets its
 * company names in the same bold `g_d2_f9` 9.96pt as its section headings, so
 * "Grubhub" and "Speaking" are typographically identical, and bold-plus-short
 * would promote half the document. Three further facts settle it, each of them
 * something a heading never has:
 *
 *  - more than three words, or a comma ("University of Illinois at Chicago");
 *  - a date on the line ("Sprout Social 2018 – 2021");
 *  - a URL or an email ("focus-ring https://github.com/…").
 *
 * And one thing a heading always has: it sits at **the same left edge as a heading
 * we did recognise**. That is what replaces "at its column's left margin" now that
 * columns are resolved upstream and `lines` is a flat sequence — the document's own
 * recognised headings tell us where headings begin in each column, so sample 3's
 * sidebar heading at x=36 and its main-column headings at x=235.8 are both
 * accounted for without this file having to know a sidebar exists.
 */
function isCustomHeading(line: SourceLine, styles: Set<string>, indents: number[]): boolean {
  if (line.isListItem || !styles.has(styleOf(line))) return false
  if (!isLabelish(line.text)) return false
  if (!indents.some((indent) => Math.abs(line.x - indent) <= INDENT_TOLERANCE * 2)) return false
  if (URL.test(line.text) || EMAIL.test(line.text)) return false
  return findDateRange(line.text) === null
}

function splitSections(lines: SourceLine[]): { banner: SourceLine[]; sections: Section[] } {
  const styles = headingStyles(lines)
  const indents = lines.filter((line) => matchVocabulary(line)).map((line) => line.x)

  const banner: SourceLine[] = []
  const sections: Section[] = []
  let current: Section | null = null

  for (const line of lines) {
    const kind: SectionKind | null =
      matchVocabulary(line) ?? (isCustomHeading(line, styles, indents) ? 'custom' : null)

    if (kind) {
      current = { kind, title: line.text, lines: [] }
      sections.push(current)
      continue
    }

    if (current) current.lines.push(line)
    else banner.push(line)
  }

  return { banner, sections }
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * Splits a section's lines into one chunk per entry.
 *
 * A résumé marks a new job three ways at once — a fresh date, a fresh employer
 * line, a break in the bullet run — and templates lean on different ones, so this
 * keys on the only thing all three share: **bullets end an entry.** Everything
 * from the first heading line down to the last bullet is one job. A date joins
 * whichever heading it is adjacent to instead of starting a chunk of its own,
 * which is what lets one function read sample 1 (date fused to the employer) and
 * sample 2 (date alone on the line *below* the title it belongs to) without
 * knowing which it is looking at.
 *
 * This depends on wrapped bullets having been rejoined already — a continuation is
 * a non-bullet line mid-run, and would otherwise open a phantom entry.
 */
function chunkEntries(lines: SourceLine[]): SourceLine[][] {
  const chunks: SourceLine[][] = []
  let current: SourceLine[] = []
  let sawBullet = false
  let sawDate = false

  for (const line of lines) {
    const dated = !line.isListItem && findDateRange(line.text) !== null

    const starts = line.isListItem
      ? false
      : current.length === 0
        ? true
        : sawBullet || (dated && sawDate)

    if (starts && current.length) {
      chunks.push(current)
      current = []
      sawBullet = false
      sawDate = false
    }

    current.push(line)
    sawBullet = sawBullet || line.isListItem
    sawDate = sawDate || dated
  }

  if (current.length) chunks.push(current)
  return chunks
}

/** The chunk's bullets, in order. Wrapping was resolved before chunking. */
function bulletsOf(chunk: SourceLine[]): string[] {
  return chunk.filter((line) => line.isListItem).map((line) => line.text)
}

/** Non-bullet lines of a chunk — the entry's heading block. */
function headingLines(chunk: SourceLine[]): SourceLine[] {
  return chunk.filter((line) => !line.isListItem)
}

/**
 * Field separators an author typed into a single heading line.
 *
 * A bullet or interpunct between fields is a deliberate act — nobody writes
 * `Fundmore.ai ML Engineer • Toronto • June 2021 – January 2023` by accident —
 * so unlike the comma and dash of `ROLE_ORG_SEPARATORS`, which have to be
 * weighed against their use inside ordinary names, these can be split on
 * unconditionally. A line without one splits to itself and nothing changes.
 */
const HEADING_FIELD_SEPARATOR = /\s*[•·|]\s*/

/** Connectors inside a place name — `Chicago / Houston`, `Raleigh-Durham`. */
const PLACE_CONNECTOR = /^[/&–—-]$/

/**
 * A field naming somewhere rather than something.
 *
 * `isLocation` wants a `City, ST` pair, which is the right bar for free text
 * where a bare capitalised word is far more likely to be an employer. Inside an
 * author-delimited field list the bar can drop, because the author has already
 * told us where the boundaries are — but only for a field that is **not the
 * first**. That restriction is the whole safety of this rule: in
 * `Acme • Senior Engineer • 2020` the bare capitalised word is the employer and
 * it leads, while in `Fundmore.ai ML Engineer • Toronto • …` the place sits
 * where convention puts it, between the name and the dates.
 */
function looksLikePlace(field: string): boolean {
  if (TITLE_WORDS.test(field) || /\d/.test(field)) return false

  const parts = words(field)
  if (parts.length === 0 || parts.length > 4) return false

  return parts.every(
    (part) => PLACE_CONNECTOR.test(part) || /^[(\p{Lu}]/u.test(part),
  )
}

/**
 * Prose under an entry heading — a sentence about the job, not another field of
 * its name. "Bootstrapped and self-funded. Paid engagements building AI systems
 * for businesses I already have direct access to…" is a paragraph; without this
 * it is just another non-bullet line, and the two-span branch below files the
 * whole sentence as the employer.
 *
 * **Not recognised by type size**, though the temptation is strong — a
 * sub-description usually is set smaller. So is a job title: sample 1 sets
 * "Senior Data Engineer Seattle, WA" smaller than the company above it, and a
 * size rule eats the title along with the prose. Size says "subordinate", which
 * both of these are.
 *
 * What separates them is being a *sentence*: it runs long, or it closes with a
 * full stop while containing a word that isn't capitalised. A name field is
 * title case and does not terminate — "Northwind — Platform Engineer",
 * "B.Sc. Applied Statistics, Minor in Computer Science". "Acme Inc." ends in a
 * stop but capitalises throughout, so it stays a name.
 */
const MAX_HEADING_WORDS = 14

function isProse(text: string): boolean {
  const parts = words(text)
  if (parts.length > MAX_HEADING_WORDS) return true
  if (!/[.!?]$/.test(text.trim())) return false

  return parts.some((part) => /^\p{Ll}/u.test(part))
}

/**
 * Pulls the date and the location out of an entry's heading and returns what is
 * left: the spans that name the organisation and the role.
 *
 * `delimited` reports whether the author separated the fields themselves. It
 * gates the fused organisation/role split downstream, which is guesswork
 * everywhere else — see `splitFusedOrgAndRole`.
 */
function dissectHeading(
  chunk: SourceLine[],
  anchor: RegExp,
): {
  date: DateRange | null
  location?: string
  spans: string[]
  delimited: boolean
  prose: string[]
} {
  let date: DateRange | null = null
  let location: string | undefined
  let delimited = false
  const spans: string[] = []
  const prose: string[] = []
  /** The line each `prose` entry last absorbed, for the wrap test below. */
  const proseLines: SourceLine[] = []

  const heading = headingLines(chunk)

  for (const line of heading) {
    if (!line.text.trim()) continue

    // Kept, not dropped: it is text the user wrote about this job, and the
    // entry has nowhere else to put it. The caller files it as a bullet, where
    // it is visible and editable, rather than losing it to make the parse tidy.
    //
    // `rejoinWrappedBullets` cannot have joined these — it follows a bullet
    // anchor and this paragraph has none — so a wrapped one arrives in pieces
    // and the same left edge and type size that mean "continuation" there mean
    // it here.
    if (line !== heading[0] && isProse(line.text)) {
      const last = proseLines[proseLines.length - 1]
      if (
        last &&
        last.page === line.page &&
        Math.abs(last.x - line.x) <= INDENT_TOLERANCE &&
        Math.abs(last.fontSize - line.fontSize) <= FONT_SIZE_TOLERANCE
      ) {
        prose[prose.length - 1] = joinWrapped(prose[prose.length - 1], line.text)
        proseLines[proseLines.length - 1] = line
        continue
      }

      prose.push(line.text.trim())
      proseLines.push(line)
      continue
    }

    const fields = line.text
      .split(HEADING_FIELD_SEPARATOR)
      .map((field) => field.trim())
      .filter(Boolean)
    if (fields.length > 1) delimited = true

    for (const [index, field] of fields.entries()) {
      collectHeadingField(field, index > 0 && fields.length > 1)
    }
  }

  return { date, location, spans, delimited, prose }

  function collectHeadingField(field: string, mayBeBarePlace: boolean) {
    let text = field

    if (!date) {
      const found = findDateRange(text)
      if (found) {
        date = found
        // A fused field ("Convoy 2022-01 – Present") keeps what is left of it; a
        // field that was only a date leaves nothing behind.
        text = text.replace(found.span, ' ').replace(/\s+/g, ' ').trim()
        if (!text) return
      }
    }

    if (!location && isLocation(text)) {
      location = text
      return
    }

    if (!location) {
      const split = splitTrailingPlace(text, anchor)
      if (split) {
        location = split.location
        spans.push(split.rest)
        return
      }
    }

    if (!location && mayBeBarePlace && looksLikePlace(text)) {
      location = text
      return
    }

    spans.push(text)
  }
}

/**
 * Splits one span into a role and an organisation, or refuses to.
 *
 * Both comma orders exist in the wild, so the separator cannot decide which side
 * is which — the vocabulary does: whichever side names a role is the role. The
 * separators are tried in order of how reliably they mean "these are two fields",
 * a comma first and a bare hyphen last, and the *author's* character is always the
 * one split on. Word processors favour a dash where LaTeX templates favour a comma
 * ("Northwind — Platform Engineer" in the DOCX fixture), and neither is a guess.
 *
 * When no side names a role the span goes into the organisation field whole and
 * the role is left empty. That is deliberate over splitting on position and being
 * right half the
 * time: "Acme, Northeast Division" filed as one employer is a field the user
 * glances past, while the same string cut in two and labelled title/company is a
 * mistake they have to spot before they can fix it.
 */
const ROLE_ORG_SEPARATORS = [/,(?=[^,]*$)/, /\s+[—–]\s+/, /\s+\|\s+/, /\s+-\s+/]

/**
 * Words that lean on the role's head noun rather than naming an employer.
 * `Technical` in "Fend Technical Co-founder" belongs to the title; `Office` in
 * "Himathi Family Office Founder" belongs to the company. Only the first kind
 * goes here.
 */
const TITLE_MODIFIERS = new Set([
  'technical', 'senior', 'staff', 'principal', 'lead', 'chief', 'associate',
  'assistant', 'junior', 'deputy', 'executive', 'global', 'regional', 'group',
  'product', 'software', 'data', 'backend', 'frontend', 'fullstack', 'platform',
  'research', 'design', 'security', 'infrastructure', 'machine', 'learning',
])

/** `ML Engineer`, `QA Lead`, `UX Designer` — an initialism binds to the title. */
function attachesToTitle(word: string): boolean {
  const bare = word.replace(/[^\p{L}]/gu, '')
  if (!bare) return false
  if (TITLE_MODIFIERS.has(bare.toLowerCase())) return true
  return bare.length <= 3 && bare === bare.toUpperCase()
}

/**
 * Splits `Fundmore.ai ML Engineer` into an employer and a role, with no
 * separator to go on — only the vocabulary and where it sits.
 *
 * **Only ever called on an author-delimited heading** (`dissectHeading`'s
 * `delimited`), and that gate is doing real work: `Software Engineer` and
 * `Product Manager` are indistinguishable from `Fend Technical Co-founder` by
 * shape alone, and splitting them would invent an employer called "Software".
 * A line that carried explicit `•` fields has already told us it is packing
 * several facts into one line, which is the only context where a fused pair is
 * more likely than a plain job title.
 *
 * The cut is the **smallest** suffix that names a role while the prefix names
 * none — "Himathi Family Office | Founder", not "Himathi | Family Office
 * Founder" — then widened left across modifiers and initialisms that belong to
 * the title, which is what turns "Fundmore.ai ML | Engineer" into
 * "Fundmore.ai | ML Engineer". If widening consumes the prefix entirely the span
 * was a bare title all along and no employer is claimed.
 */
function splitFusedOrgAndRole(span: string): { role?: string; organisation?: string } | null {
  const parts = words(span)
  if (parts.length < 2) return null

  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const suffix = parts.slice(index).join(' ')
    const prefix = parts.slice(0, index).join(' ')
    if (!TITLE_WORDS.test(suffix) || TITLE_WORDS.test(prefix)) continue

    let cut = index
    while (cut > 0 && attachesToTitle(parts[cut - 1])) cut -= 1

    if (cut === 0) return { role: span }
    return { organisation: parts.slice(0, cut).join(' '), role: parts.slice(cut).join(' ') }
  }

  return null
}

function splitRoleAndOrg(
  span: string,
  delimited = false,
): { role?: string; organisation?: string } {
  for (const separator of ROLE_ORG_SEPARATORS) {
    const found = span.match(separator)
    if (!found || found.index === undefined) continue

    const before = span.slice(0, found.index).trim()
    const after = span.slice(found.index + found[0].length).trim()
    if (!before || !after) continue

    if (TITLE_WORDS.test(before) && !TITLE_WORDS.test(after)) {
      return { role: before, organisation: after }
    }
    if (TITLE_WORDS.test(after) && !TITLE_WORDS.test(before)) {
      return { role: after, organisation: before }
    }
  }

  if (delimited) {
    const fused = splitFusedOrgAndRole(span)
    if (fused) return fused
  }

  return TITLE_WORDS.test(span) ? { role: span } : { organisation: span }
}

function parseExperience(lines: SourceLine[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = []

  for (const chunk of chunkEntries(lines)) {
    const { date, location, spans, delimited, prose } = dissectHeading(chunk, TITLE_WORDS)
    const bullets = [...prose, ...bulletsOf(chunk)]

    let company = ''
    let title = ''

    if (spans.length >= 2) {
      // Two spans means the document already made the split; the vocabulary only
      // has to say which is which. "First one is the employer" is the fallback
      // because it is the convention every two-line template in the corpus keeps.
      const role = spans.findIndex((span) => TITLE_WORDS.test(span))
      if (role === -1) {
        company = spans[0]
        title = spans[1]
      } else {
        title = spans[role]
        company = spans.find((_, index) => index !== role) ?? ''
      }
    } else if (spans.length === 1) {
      const { role, organisation } = splitRoleAndOrg(spans[0], delimited)
      title = role ?? ''
      company = organisation ?? ''
    }

    if (!company && !title && bullets.length === 0) continue
    entries.push({ company, title, location, start: date?.start, end: date?.end, bullets })
  }

  return entries
}

const EDUCATION_ANCHOR = new RegExp(`${DEGREE_WORDS.source}|${INSTITUTION_WORDS.source}`, 'i')

function parseEducation(lines: SourceLine[]): EducationEntry[] {
  const entries: EducationEntry[] = []

  for (const chunk of chunkEntries(lines)) {
    const { date, location, spans } = dissectHeading(chunk, EDUCATION_ANCHOR)
    const bullets = bulletsOf(chunk)

    let institution = ''
    let degree: string | undefined

    if (spans.length === 1) {
      const split = splitEducationSpan(spans[0])
      institution = split.institution ?? ''
      degree = split.degree
    } else {
      const degreeAt = spans.findIndex((span) => DEGREE_WORDS.test(span))
      const namesSchool = spans.findIndex(
        (span, at) => at !== degreeAt && INSTITUTION_WORDS.test(span),
      )

      if (degreeAt === -1) {
        institution = spans[0] ?? ''
        degree = spans[1]
      } else if (namesSchool !== -1) {
        degree = spans[degreeAt]
        institution = spans[namesSchool]
      } else {
        // No other span names a school, so the degree span carries the school
        // with it and the remaining spans are supplementary — a GPA, an honour.
        // Taking "the other span" here is what filed `GPA 3.59/4.0` as the
        // university: with an author-delimited heading there can be more than
        // two fields, and "the other one" stops meaning anything.
        const split = splitEducationSpan(spans[degreeAt])
        degree = split.degree ?? spans[degreeAt]
        institution = split.institution ?? ''
      }
    }

    if (!institution && !degree && bullets.length === 0) continue
    entries.push({ institution, degree, location, start: date?.start, end: date?.end, bullets })
  }

  return entries
}

/** "B.S. Electrical and Computer Engineering, University of Texas at Austin". */
function splitEducationSpan(span: string): { degree?: string; institution?: string } {
  const comma = span.indexOf(',')
  if (comma <= 0) {
    return DEGREE_WORDS.test(span) ? { degree: span } : { institution: span }
  }

  const before = span.slice(0, comma).trim()
  const after = span.slice(comma + 1).trim()
  if (DEGREE_WORDS.test(before) && INSTITUTION_WORDS.test(after)) {
    return { degree: before, institution: after }
  }
  if (DEGREE_WORDS.test(after) && INSTITUTION_WORDS.test(before)) {
    return { degree: after, institution: before }
  }
  // A comma we cannot read is left in place rather than cut on a coin flip.
  return { institution: span }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const ITEM_SEPARATORS = /[,;·•∙‧|]+|\s+\/\s+/
const TRAILING_SEPARATOR = /[,;·•∙‧|]$/

function splitItems(text: string): string[] {
  return text.split(ITEM_SEPARATORS).map((item) => item.trim()).filter(Boolean)
}

/**
 * Skills, which arrive in more shapes than any other section.
 *
 * Three forms in three fixtures. Sample 1: `Languages: Python, Scala, SQL, Go`.
 * Sample 3: `Languages: TypeScript · JavaScript · CSS`, a different separator, and
 * it wraps onto the next line. Sample 2's moderncv layout puts the category and
 * its items on **different baselines and in the wrong order** — "Kubernetes,
 * Terraform, AWS, Envoy" at y=466 and the word "Infrastructure" that labels it at
 * y=473, out in the left rail, below it.
 *
 * So a bare row of values takes its label from the row *beside* it — adjacency,
 * not geometry, because the geometry says the label comes second. And the wrap is
 * detected from the **trailing separator the typesetter left behind** ("Vitest ·"
 * then "Playwright") rather than from indentation, because sample 3's continuation
 * is not indented at all: it starts at the column margin, looking exactly like the
 * category it is not.
 */
function parseSkills(lines: SourceLine[]): SkillGroup[] {
  const groups: { category: string; items: string }[] = []
  const consumed = new Set<SourceLine>()
  const content = lines.filter((line) => line.text.trim())

  content.forEach((line, index) => {
    if (consumed.has(line)) return

    const text = line.text.trim()
    const previous = groups[groups.length - 1]

    // A wrap continues the group above it, whatever it looks like on its own.
    if (previous && TRAILING_SEPARATOR.test(previous.items.trim())) {
      previous.items = `${previous.items} ${text}`
      return
    }

    const colon = text.indexOf(':')
    if (colon > 0 && colon <= 34) {
      groups.push({ category: text.slice(0, colon).trim(), items: text.slice(colon + 1).trim() })
      return
    }

    if (isLabelish(text)) {
      groups.push({ category: text.replace(/:$/, ''), items: '' })
      return
    }

    // A row of bare values. Prefer an empty group waiting above it, then a label
    // on the row below (moderncv's inverted order), and only then fall back to
    // reading the leading words as the category.
    if (previous && !previous.items.trim()) {
      previous.items = text
      return
    }

    const next = content[index + 1]
    if (next && !consumed.has(next) && !next.isListItem && isLabelish(next.text)) {
      consumed.add(next)
      groups.push({ category: next.text.replace(/:$/, ''), items: text })
      return
    }

    // "Infrastructure Kubernetes, Terraform, AWS, Envoy" — the category is
    // whatever precedes the first item. Both halves stay verbatim spans.
    const first = text.split(ITEM_SEPARATORS)[0]?.trim() ?? ''
    const boundary = first.lastIndexOf(' ')
    if (boundary > 0) {
      groups.push({
        category: first.slice(0, boundary).trim(),
        items: text.slice(boundary + 1).trim(),
      })
      return
    }

    groups.push({ category: '', items: text })
  })

  return groups
    .map((group) => ({ category: group.category, items: splitItems(group.items) }))
    .filter((group) => group.category || group.items.length)
}

// ---------------------------------------------------------------------------
// Projects and custom sections
// ---------------------------------------------------------------------------

const NAME_DESCRIPTION = /\s+[—–]\s+|\s+-\s+|\s+:\s+/

function parseProjects(lines: SourceLine[]): ProjectEntry[] {
  const entries: ProjectEntry[] = []

  for (const chunk of chunkEntries(lines)) {
    const bullets = bulletsOf(chunk)
    let name = ''
    let description: string | undefined
    let url: string | undefined

    for (const line of headingLines(chunk)) {
      let text = line.text.trim()

      const link = text.match(URL)
      if (link) {
        url ??= link[0].replace(/[.,;]$/, '')
        text = text.replace(link[0], ' ').replace(/\s+/g, ' ').trim()
      }
      if (!text) continue

      if (!name) {
        // "slowquery — CLI that explains Postgres query plans in plain English"
        // carries both fields on one line, separated by the author's own dash —
        // so splitting on it copies rather than composes.
        const split = text.split(NAME_DESCRIPTION)
        name = split[0].trim()
        if (split.length > 1) description ??= split.slice(1).join(' ').trim()
        continue
      }
      description ??= text
    }

    if (!name && !description && bullets.length === 0) continue
    entries.push({ name, description, url, bullets })
  }

  return entries
}

function parseCustom(section: Section): CustomSection {
  const bullets = bulletsOf(section.lines)
  // A section written without glyphs is the same list; keep its lines rather than
  // dropping content because the author did not use bullets.
  const fallback = section.lines.map((line) => line.text)
  return { title: section.title, bullets: bullets.length ? bullets : fallback }
}

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

function isContactLine(text: string): boolean {
  return EMAIL.test(text) || URL.test(text) || PHONE.test(text)
}

/**
 * The banner: name, headline, contact line.
 *
 * The name is **the largest type on the first page**, which holds across every
 * résumé template worth the name — 24.79pt against a 9–11pt body in all three
 * fixtures. When there is no font information to read the fallback is the first
 * line, because that is where a name goes; positional, but still a copy of a real
 * span rather than an invention.
 *
 * Contact details come out by regex, which is the one place in this file where a
 * pattern is genuinely authoritative: an email is an email. The location is then
 * whatever the contact line still says once the email, the URL and the phone
 * number have been removed — the separator varies ("·" in samples 1 and 3, "|" in
 * sample 2), so it is the *removal* that identifies the location and not the
 * split.
 */
function parseBasics(banner: SourceLine[], summaryLines: SourceLine[]): ResumeContent['basics'] {
  const basics: ResumeContent['basics'] = {
    name: '',
    label: undefined,
    email: undefined,
    phone: undefined,
    url: undefined,
    location: undefined,
    summary: undefined,
  }

  const front = banner.filter((line) => line.page === banner[0]?.page)
  if (front.length) {
    const largest = Math.max(...front.map((line) => line.fontSize))
    const nameLine =
      front.find((line) => line.fontSize === largest && !isContactLine(line.text)) ?? front[0]
    basics.name = nameLine.text

    const rest = front.filter((line) => line !== nameLine)

    let remainder = rest
      .filter((line) => isContactLine(line.text))
      .map((line) => line.text)
      .join(' ')

    const email = remainder.match(EMAIL)
    if (email) {
      basics.email = email[0]
      remainder = remainder.replace(email[0], ' ')
    }
    // **Every** link comes out, not just the one that becomes `url`. The schema
    // holds one link and a contact line routinely carries three (a site, a
    // GitHub, a LinkedIn) — so the extras are debris, and debris is what
    // `location` reads at the end of this function. A leftover
    // "github.com/danaokoye" is one word with no role word in it, which is
    // precisely the shape the location heuristic accepts, and the user's city
    // becomes their GitHub. Removing the first link only was survivable while
    // links needed a scheme, because a bare-domain list never reached here at
    // all; it stopped being survivable the moment it did.
    for (;;) {
      const url = remainder.match(URL)
      if (!url) break
      basics.url ??= url[0].replace(/[.,;]$/, '')
      remainder = remainder.replace(url[0], ' ')
    }
    const phone = remainder.match(PHONE)
    if (phone) {
      basics.phone = phone[0].trim()
      remainder = remainder.replace(phone[0], ' ')
    }

    // What the contact line still says, as its parts. Collapsed and stripped of
    // the separators its removed neighbours left behind — a value carrying
    // "Engineer —   —" is not a verbatim span of anything, and the substring check
    // in `../import.ts` would rightly flag it.
    const leftovers = remainder
      .split(SEPARATORS)
      .map((part) => part.replace(/\s+/g, ' ').replace(EDGE_PUNCTUATION, ''))
      .filter((part) => part.length > 1)

    basics.label =
      rest.find(
        (line) => !isContactLine(line.text) && !line.isListItem && words(line.text).length <= 8,
      )?.text ?? leftovers.find((part) => TITLE_WORDS.test(part))

    // A leftover is only a location if it reads like a place. Word processors fuse
    // the headline into the contact line ("Platform Engineer — dana@… — +1 …"), so
    // "whatever is left over" on its own files a job title as a city. A role word
    // disqualifies it; two words or fewer is the allowance that keeps "London" and
    // "New York" without letting a job title through.
    basics.location = leftovers.find(
      (part) => isLocation(part) || (words(part).length <= 2 && !TITLE_WORDS.test(part)),
    )
  }

  const summary = summaryLines.map((line) => line.text.trim()).filter(Boolean).join(' ')
  if (summary) basics.summary = summary

  return basics
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Turns a read document into a `ResumeContent` draft, copying and never writing.
 *
 * The result is a draft on purpose: it lands on the review screen where every
 * field is editable and the ones this could not resolve are simply blank. So the
 * measure of success is not "no empty fields" but "no field the user has to
 * un-invent".
 */
export function structureResume(doc: SourceDocument): ResumeContent {
  try {
    return structure(doc)
  } catch {
    // A shape this file has never seen must not cost the user their import. The
    // review screen still shows the raw text beside the form either way.
    return parseResumeContent({ basics: {} })
  }
}

function structure(doc: SourceDocument): ResumeContent {
  const { banner, sections } = splitSections(rejoinWrappedBullets(doc))

  const experience: ExperienceEntry[] = []
  const education: EducationEntry[] = []
  const skills: SkillGroup[] = []
  const projects: ProjectEntry[] = []
  const custom: CustomSection[] = []
  const summaryLines: SourceLine[] = []

  for (const section of sections) {
    if (section.kind === 'summary') summaryLines.push(...section.lines)
    else if (section.kind === 'experience') experience.push(...parseExperience(section.lines))
    else if (section.kind === 'education') education.push(...parseEducation(section.lines))
    else if (section.kind === 'skills') skills.push(...parseSkills(section.lines))
    else if (section.kind === 'projects') projects.push(...parseProjects(section.lines))
    else custom.push(parseCustom(section))
  }

  return parseResumeContent({
    basics: parseBasics(banner, summaryLines),
    experience,
    education,
    skills,
    projects,
    custom: custom.filter((section) => section.title || section.bullets.length),
  })
}
