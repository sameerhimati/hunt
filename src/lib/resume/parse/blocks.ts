/**
 * The reader → structurer contract, and the PDF half of it.
 *
 * Importing a résumé used to require an LLM key, which put a key in front of the
 * very first thing a new user does. It never needed to: extracting a PDF's text
 * is mechanical, and so is most of the work of deciding which text is a section
 * heading. What actually needed a model was *structuring* — and a model that
 * structures can also quietly invent, which is the one thing hunt refuses to do.
 *
 * So the pipeline splits in two. This file turns a document into lines that
 * remember how they looked; `structure.ts` turns those lines into
 * `ResumeContent` by copying verbatim spans and never authoring. A regex cannot
 * fabricate a job title. That makes the keyless path the *honest* one rather
 * than the degraded one, and `scoreConfidence()` in `../import.ts` proves it:
 * every field it emits is found verbatim in the source, so the review screen
 * reads "every field matched the PDF".
 *
 * Typography is the whole reason this works. A résumé's structure is carried
 * almost entirely in how it looks — the name is the biggest thing on the page,
 * section headings are a distinct size at the left margin, a date sits
 * right-aligned against its employer. Merged plain text throws all of that away
 * and forces the structurer to guess from vocabulary alone. Keeping size,
 * position and font turns most of those guesses into measurements.
 */

/** One visual line of the source document, with the typography that survived extraction. */
export interface SourceLine {
  /** The line's visible text, re-joined from per-glyph runs, bullet glyph stripped. */
  text: string
  /** 0-based page index (PDF) or section order (DOCX). */
  page: number
  /**
   * Baseline position, normalised so **larger means further down the page**.
   * PDF's own y-axis points up from the bottom, which reads backwards for
   * anything that wants document order; this flips it once, here, so no
   * consumer has to remember.
   */
  y: number
  /** Left edge in points. Indentation is how documents mark hierarchy. */
  x: number
  /** Right edge in points. With `x`, this is what reveals a two-column layout. */
  right: number
  /** Largest font size on the line. Headings are big; the name is biggest. */
  fontSize: number
  /** Dominant font id. Same size + different font is how "bold" survives extraction. */
  fontName: string
  /** The line opened with a bullet glyph, or was a real DOCX list item. */
  isListItem: boolean
}

export interface SourceDocument {
  kind: 'pdf' | 'docx'
  lines: SourceLine[]
  /**
   * Newline-joined plain text of the whole document.
   *
   * This is the haystack `scoreConfidence()` checks extracted fields against, so
   * it has to contain the document's words in the form the structurer will emit
   * them — which is why the dehyphenation below is applied here too.
   */
  text: string
}

/**
 * Bullet glyphs, stripped from `text` and remembered in `isListItem`.
 *
 * Stripping rather than keeping is deliberate: the structurer copies bullet text
 * verbatim into `ResumeContent`, and a leading "• " would travel into the
 * rendered résumé. Carrying the fact in a boolean loses nothing.
 */
const BULLET_GLYPHS = /^[•‣▪●◦⁃∙*·]\s*|^[-–—]\s+/

/**
 * A glyph run that is *only* a bullet.
 *
 * Typeset résumés hang the bullet in the margin as its own run, which means the
 * line's leftmost ink is the glyph and its text starts further right. Measuring
 * the line from the glyph would put a bullet at x=33 and the wrapped line
 * continuing it at x=46, and "is this a continuation?" — which the structurer
 * answers by comparing indents — would come out false for every wrapped bullet
 * in the document. So the glyph is remembered and then excluded from geometry.
 */
const BULLET_ONLY = /^[•‣▪●◦⁃∙*·]$/

/**
 * Two glyph runs belong to the same line when their baselines are this close.
 *
 * Not zero: a line mixing font sizes (an 11pt company beside a 10pt date) has
 * baselines that differ by a fraction of a point, and superscripts differ by
 * more. 2.5pt is comfortably inside a single line's leading and comfortably
 * outside the gap to the next line.
 */
const BASELINE_TOLERANCE = 2.5

/**
 * A horizontal gap wider than this is a space; anything less is one word split
 * across two glyph runs.
 *
 * pdf.js splits a run wherever the font or kerning changes, so "TypeScript" can
 * arrive as "Type" + "Script" with no gap at all. Joining on a naive space
 * produced words that then failed the verbatim check downstream — the substring
 * test is unforgiving, which is exactly why it is worth having.
 */
const SPACE_GAP = 1.2

/**
 * A gutter must be at least this wide to count as a column boundary.
 *
 * Narrower than an em-space at body size and you are looking at word spacing,
 * not a layout decision.
 */
const MIN_GUTTER_POINTS = 14

/**
 * A gutter may be crossed by at most this fraction of the page's lines.
 *
 * This is the whole discriminator between a two-column layout and a
 * single-column one with right-aligned dates. Sample 1 sets employers at the
 * left margin and their date ranges hard right, which leaves a wide empty band
 * in the middle of *those* lines — but its bullets run straight through it. A
 * real sidebar gutter is empty down the entire page. Zero is too strict: a
 * horizontal rule or a stray wide heading legitimately crosses one.
 */
const MAX_GUTTER_CROSSINGS = 0.12

interface Glyph {
  str: string
  x: number
  right: number
  y: number
  size: number
  font: string
}

/**
 * Re-joins words the typesetter split across a line ("down-\ntime").
 *
 * Same rule as `../import.ts`, for the same reason: only when the next line
 * starts lowercase, which is the signal that the break is hyphenation and not a
 * real compound — "on-call" never appears as "on-\nCall". Duplicated rather
 * than shared because that copy operates on unpdf's merged string and this one
 * operates on joined lines; a shared helper would have to know about both.
 */
function dehyphenate(text: string): string {
  return text.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
}

/** Groups glyph runs sharing a baseline, without regard to columns. */
function toRows(glyphs: Glyph[]): Glyph[][] {
  const ordered = [...glyphs].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: Glyph[][] = []

  for (const glyph of ordered) {
    const row = rows[rows.length - 1]
    // Compared against the row's first glyph rather than a running mean: a long
    // line of drifting baselines would let a mean wander into the next line.
    if (row && Math.abs(glyph.y - row[0].y) <= BASELINE_TOLERANCE) row.push(glyph)
    else rows.push([glyph])
  }

  return rows
}

/**
 * Finds the x-coordinate splitting a two-column page, or null for one column.
 *
 * Without this, a sidebar résumé is destroyed rather than merely mis-parsed:
 * "Education" and "Experience" sit on one baseline in two different columns, so
 * baseline grouping welds them into the line "Education Experience" and every
 * field downstream inherits the corruption. No amount of cleverness in the
 * structurer can undo it, which is why the split has to happen here.
 */
function findGutter(rows: Glyph[][]): number | null {
  if (rows.length < 6) return null

  const left = Math.min(...rows.map((row) => Math.min(...row.map((g) => g.x))))
  const right = Math.max(...rows.map((row) => Math.max(...row.map((g) => g.right))))
  const span = right - left
  if (span < 4 * MIN_GUTTER_POINTS) return null

  // One bucket per point of page width, counting how many rows cross it.
  const crossings = new Array(Math.ceil(span) + 1).fill(0)
  for (const row of rows) {
    for (const glyph of row) {
      const from = Math.max(0, Math.floor(glyph.x - left))
      const to = Math.min(crossings.length - 1, Math.ceil(glyph.right - left))
      for (let at = from; at <= to; at += 1) crossings[at] += 1
    }
  }

  const ceiling = rows.length * MAX_GUTTER_CROSSINGS
  // Only the middle of the page can hold a gutter; the empty margins either
  // side of the text are not column boundaries.
  const from = Math.floor(span * 0.2)
  const to = Math.ceil(span * 0.8)

  let best: { start: number; end: number } | null = null
  let start: number | null = null

  for (let at = from; at <= to; at += 1) {
    if (crossings[at] <= ceiling) {
      start ??= at
      continue
    }
    if (start !== null && at - start >= MIN_GUTTER_POINTS) {
      if (!best || at - start > best.end - best.start) best = { start, end: at }
    }
    start = null
  }
  if (start !== null && to - start >= MIN_GUTTER_POINTS) {
    if (!best || to - start > best.end - best.start) best = { start, end: to }
  }

  return best ? left + (best.start + best.end) / 2 : null
}

/**
 * Re-orders rows into human reading order for a two-column page.
 *
 * Rows that cross the gutter are full-width — a name, a contact line, a rule —
 * and they delimit bands. Inside a band the left column is read top to bottom,
 * then the right, which is how a person reads a sidebar résumé and therefore the
 * order the structurer should see sections in.
 */
function inReadingOrder(rows: Glyph[][], gutter: number): Glyph[][] {
  const ordered: Glyph[][] = []
  let leftBand: Glyph[][] = []
  let rightBand: Glyph[][] = []

  const flush = () => {
    ordered.push(...leftBand, ...rightBand)
    leftBand = []
    rightBand = []
  }

  for (const row of rows) {
    // A single run of text spanning the gutter cannot be two columns, whatever
    // the geometry says — it is one full-width line, and it ends the band.
    if (row.some((glyph) => glyph.x < gutter && glyph.right > gutter)) {
      flush()
      ordered.push(row)
      continue
    }

    const left = row.filter((glyph) => glyph.right <= gutter)
    const right = row.filter((glyph) => glyph.right > gutter)

    // The split is the point of all this: one baseline holding "Education" and
    // "Experience" becomes two lines, in two columns, instead of one wrong one.
    if (left.length) leftBand.push(left)
    if (right.length) rightBand.push(right)
  }
  flush()

  return ordered
}

function toLines(rows: Glyph[][], page: number): SourceLine[] {
  return rows.map((row) => {
    const sorted = [...row].sort((a, b) => a.x - b.x)

    // Split the hanging bullet off the line's ink before anything is measured.
    const hanging = sorted[0] && BULLET_ONLY.test(sorted[0].str.trim())
    const ink = hanging && sorted.length > 1 ? sorted.slice(1) : sorted

    let text = ''
    let cursor = -Infinity
    for (const glyph of ink) {
      if (text && glyph.x - cursor > SPACE_GAP) text += ' '
      text += glyph.str
      cursor = glyph.right
    }

    const stripped = text.replace(BULLET_GLYPHS, '')

    // The dominant font is the one carrying the most characters, not the first
    // one: a line beginning with a bullet glyph in a symbol font would otherwise
    // report that symbol font as the line's identity.
    const byFont = new Map<string, number>()
    for (const glyph of ink) {
      byFont.set(glyph.font, (byFont.get(glyph.font) ?? 0) + glyph.str.trim().length)
    }
    const fontName = [...byFont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

    return {
      text: stripped.trim(),
      page,
      y: ink[0].y,
      x: Math.min(...ink.map((glyph) => glyph.x)),
      right: Math.max(...ink.map((glyph) => glyph.right)),
      fontSize: Math.max(...ink.map((glyph) => glyph.size)),
      fontName,
      isListItem: hanging || stripped !== text,
    }
  })
}

/**
 * PDF → lines that remember their typography.
 *
 * Deliberately separate from `extractPdfText()` in `../import.ts` rather than
 * replacing it: that function feeds the LLM path and the review screen's source
 * pane, both of which want unpdf's own merged string. This one exists because
 * merging is exactly what destroys the signal the structurer needs.
 */
export async function readPdf(pdf: Buffer | Uint8Array): Promise<SourceDocument> {
  // Lazily imported for the reason the sibling module gives: unpdf pulls in the
  // whole pdf.js worker, which has no business loading in a request that isn't
  // importing a résumé.
  const { getDocumentProxy } = await import('unpdf')

  const document = await getDocumentProxy(new Uint8Array(pdf))
  const lines: SourceLine[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const height = page.getViewport({ scale: 1 }).height
    const content = await page.getTextContent()

    const glyphs: Glyph[] = []
    for (const item of content.items) {
      if (!('str' in item) || !('transform' in item)) continue
      if (!item.str || !item.str.trim()) continue

      const transform = item.transform as number[]
      const width = typeof item.width === 'number' ? item.width : 0

      glyphs.push({
        str: item.str,
        x: transform[4],
        right: transform[4] + width,
        // Flipped here so `y` means what SourceLine promises it means.
        y: height - transform[5],
        size: Math.abs(transform[3]),
        font: typeof item.fontName === 'string' ? item.fontName : '',
      })
    }

    const rows = toRows(glyphs)
    const gutter = findGutter(rows)
    const ordered = gutter === null ? rows : inReadingOrder(rows, gutter)

    lines.push(...toLines(ordered, pageNumber - 1).filter((line) => line.text !== ''))
  }

  return {
    kind: 'pdf',
    lines,
    text: dehyphenate(lines.map((line) => line.text).join('\n')),
  }
}
