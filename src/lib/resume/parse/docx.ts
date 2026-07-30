import { inflateRawSync } from 'node:zlib'

import { ResumeImportError } from '../import-core'

import type { SourceDocument, SourceLine } from './blocks'

/**
 * DOCX reading — the import path that needs no API key.
 *
 * A `.docx` is a zip holding `word/document.xml`, and we read it directly
 * rather than through a converter. `mammoth` was the obvious alternative and it
 * was rejected for one reason: it renders DOCX to semantic HTML, which throws
 * away exactly the run-level detail this contract is built on — `w:sz`,
 * `w:ind`, `w:numPr`. Going to the OOXML means the zip container is ours to
 * parse, which is 60 lines of a rigidly specified binary format; the one
 * dependency we do take is an XML parser, because XML escaping and namespaces
 * are where a hand-rolled tokeniser silently corrupts a user's words, and the
 * words are load-bearing (`scoreConfidence()` in import.ts asserts every
 * extracted field appears verbatim in `SourceDocument.text`).
 *
 * ## The translation this file performs
 *
 * `SourceLine` was designed for PDF, where `fontSize`/`x`/`y` are physical
 * measurements of ink on a page. **DOCX has no layout — it has semantics**,
 * which is better information badly shaped for this contract. So each field is
 * a deliberate translation, and each is either honest or explicitly marked as
 * not a measurement:
 *
 *  - `fontSize` — the run's real `w:sz` when present, else *synthesised from
 *    the paragraph style* (Title 24 / Heading1 18 / Heading2 14 / Heading3 12 /
 *    body 11). The structurer finds section headings by typographic distinction
 *    — a larger `fontSize` *or* a `fontName` unlike the surrounding body — so a
 *    DOCX heading has to look distinct in the same numeric language a PDF
 *    heading speaks. Synthesising both fields from the style is what makes a
 *    Word heading legible to a rule written against PDF glyphs. A style-only
 *    heading with no `w:sz` is the common case, not the exotic one: Word keeps
 *    heading sizes in `styles.xml`.
 *  - `fontName` — the run's font, else the style id, plus a `-bold` suffix for a
 *    bold run. The field exists so "same size, different font" reads as
 *    emphasis, and bold is how a DOCX résumé marks a job title; giving it a
 *    distinguishable value is what keeps that signal alive through extraction.
 *  - `x` — real, from `w:ind` (twips → points). This is the one geometric field
 *    DOCX can answer honestly.
 *  - `right` — **not a measurement.** DOCX has no rendered width, so every line
 *    gets the same constant. Column clustering must not be trusted for DOCX.
 *    Inventing a per-line width from character counts would have made
 *    two-column detection *appear* to work while being fiction.
 *  - `y` — a counter in document order. The field only has to sort lines, and
 *    document order is the true order. Note the corollary: blank-line gaps are
 *    unrepresentable, so a shared structurer cannot use y-deltas on DOCX.
 *  - `page` — section index, advanced by a real `w:sectPr` break. Page numbers
 *    don't exist until something renders the file, and guessing them would be
 *    the same lie as `right`.
 *
 * ## One thing a shared consumer must know
 *
 * A DOCX "line" is a paragraph, and a paragraph is *logical* — a 200-character
 * bullet arrives whole, because nothing in the file records where it would wrap.
 * So the structurer's wrapped-continuation rule (`isListItem === false` and
 * `x` ≈ the previous line's `x`) has nothing to do here, and worse, it fires
 * wrongly: an ordinary paragraph after a bullet list shares the bullet's indent
 * and would be glued onto it. Continuation joining must be skipped when
 * `kind === 'docx'`. There is no visual wrapping to repair, and by the same
 * argument no hyphenation to undo — `w:softHyphen` renders only when a word
 * wraps, so it is dropped rather than emitted as a `-`.
 *
 * Known gaps, all of them the same shape — we read `document.xml` and nothing
 * else, so nothing inherited from `styles.xml` or `numbering.xml` resolves:
 * bold declared by a style rather than a run reads as not-bold, and a list
 * indent that lives in the numbering definition reads as `x: 0`. Reading those
 * parts means implementing the OOXML style-inheritance chain, which is a large
 * amount of code for a marginal gain on résumés. Table cells are a second gap:
 * their paragraphs come out in row-major order, so a two-column table layout
 * interleaves. `w:tcW` would give a genuinely measured cell edge and would fix
 * it — deliberately deferred, not overlooked.
 */

export type { SourceDocument, SourceLine } from './blocks'

/** The only zip entry we need; the other fifteen describe how to render it. */
const DOCUMENT_ENTRY = 'word/document.xml'

/** OOXML measures indents in twips. */
const TWIPS_PER_POINT = 20

/** `w:sz` is in half-points, because Word. */
const HALF_POINTS_PER_POINT = 2

/**
 * Synthesised sizes for style-only headings, keyed by normalised style id.
 * The numbers are ordinary Word defaults on purpose: they have to be plausible
 * against a PDF's real measurements, since one structurer reads both.
 */
const STYLE_FONT_SIZES: Record<string, number> = {
  title: 24,
  heading1: 18,
  heading2: 14,
  heading3: 12,
}

/** Body text, and the floor for anything we can't identify. */
const BODY_FONT_SIZE_PT = 11

/** Word's implicit paragraph style when `w:pStyle` is absent. */
const IMPLICIT_STYLE_ID = 'Normal'

/**
 * The same value on every line, so no caller can mistake it for a measurement.
 * US Letter minus one-inch margins — a plausible text column, not this
 * document's text column, which is unknowable without rendering.
 */
const UNMEASURED_RIGHT_EDGE_PT = 468

/**
 * A bullet typed as text rather than made a list. The trailing `\s` matters:
 * without it "-5% churn" and "*args" become bullets and lose their first
 * character.
 */
const TYPED_BULLET = /^[•▪–*-]\s+/u

const NOT_A_DOCX = 'That file could not be read as a DOCX.'
const NOT_A_WORD_FILE = 'That file is a zip archive, but not a Word document.'
const LEGACY_DOC =
  'That looks like a legacy Word .doc file. Open it and re-save as .docx (File → Save As → Word Document), then try again.'

/** OLE2 compound-file magic: every pre-2007 binary `.doc` starts with it. */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

export async function readDocx(docx: Buffer | Uint8Array): Promise<SourceDocument> {
  const bytes: Uint8Array = docx

  // Checked before the zip reader so the user gets told what's actually wrong.
  // A binary .doc is a different format, not a broken .docx, and "could not be
  // read" would send them looking for corruption that isn't there.
  if (OLE_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new ResumeImportError(LEGACY_DOC)
  }

  // Lazily imported for the reason unpdf is (import.ts:45): a résumé parser has
  // no business loading in a request that isn't importing a résumé.
  const { XMLParser } = await import('fast-xml-parser')

  const documentXml = readZipEntry(bytes, DOCUMENT_ENTRY)
  if (!documentXml) throw new ResumeImportError(NOT_A_WORD_FILE)

  let tree: XmlNode[]
  try {
    tree = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      // Word writes `<w:t xml:space="preserve">Senior </w:t>` and relies on that
      // trailing space to separate it from the next run. Trimming — the library
      // default — silently welds words together, which would break the verbatim
      // substring check downstream.
      trimValues: false,
      // "2021" is a date fragment, not a number to be coerced.
      parseTagValue: false,
      parseAttributeValue: false,
    }).parse(new TextDecoder().decode(documentXml)) as XmlNode[]
  } catch (error) {
    throw new ResumeImportError(NOT_A_DOCX, { cause: error })
  }

  const paragraphs: XmlNode[][] = []
  collectParagraphs(tree, paragraphs)

  const lines: SourceLine[] = []
  let section = 0

  for (const paragraph of paragraphs) {
    const props = paragraphProps(paragraph)
    const styleSize = STYLE_FONT_SIZES[normaliseStyleId(props.styleId)] ?? BODY_FONT_SIZE_PT

    for (const segment of splitOnBreaks(paragraph)) {
      const line = toLine(segment, props, styleSize, section, lines.length)
      if (line) lines.push(line)
    }

    // `w:sectPr` inside `w:pPr` closes the section *at* this paragraph, so the
    // increment lands after it.
    if (props.endsSection) section += 1
  }

  return { kind: 'docx', lines, text: lines.map((line) => line.text).join('\n') }
}

/* -------------------------------------------------------------------------- */
/* Paragraphs                                                                 */
/* -------------------------------------------------------------------------- */

interface ParagraphProps {
  styleId?: string
  /** Left indent in points, from `w:ind`. */
  indentPt: number
  /** A real numbered or bulleted list item (`w:numPr`). */
  isList: boolean
  endsSection: boolean
}

interface RunStyle {
  /** Only set when the run carries an explicit `w:sz`. */
  sizePt?: number
  font?: string
  bold: boolean
}

interface Piece {
  text: string
  style: RunStyle
}

/**
 * Every `w:p` in document order, wherever it lives.
 *
 * Recursing into unrecognised elements rather than walking a fixed path is what
 * makes table cells, text boxes, content controls and tracked insertions all
 * work without naming any of them.
 */
function collectParagraphs(nodes: XmlNode[], out: XmlNode[][]): void {
  for (const node of nodes) {
    const tag = tagOf(node)
    if (!tag) continue
    if (localName(tag) === 'p') {
      out.push(childrenOf(node, tag))
      continue
    }
    collectParagraphs(childrenOf(node, tag), out)
  }
}

function paragraphProps(paragraph: XmlNode[]): ParagraphProps {
  const pPr = paragraph.find((node) => localName(tagOf(node) ?? '') === 'pPr')
  const props: ParagraphProps = { indentPt: 0, isList: false, endsSection: false }
  if (!pPr) return props

  for (const node of childrenOf(pPr, tagOf(pPr) as string)) {
    switch (localName(tagOf(node) ?? '')) {
      case 'pStyle':
        props.styleId = attr(node, 'val')
        break
      case 'ind': {
        // `w:start` is the newer, writing-direction-aware spelling of `w:left`.
        // `w:hanging` is ignored deliberately: it moves the bullet glyph, not
        // the text, and `x` is where the text begins.
        const twips = Number(attr(node, 'left') ?? attr(node, 'start') ?? NaN)
        if (Number.isFinite(twips)) props.indentPt = twips / TWIPS_PER_POINT
        break
      }
      case 'numPr':
        props.isList = true
        break
      case 'sectPr':
        props.endsSection = true
        break
    }
  }

  return props
}

/**
 * A paragraph's text, split at each `w:br`.
 *
 * A break is a line the reader sees, and lines are the unit the structurer
 * reasons in — a contact block written with soft breaks has to arrive as
 * several lines, or the whole header collapses into one.
 */
function splitOnBreaks(paragraph: XmlNode[]): Piece[][] {
  const segments: Piece[][] = [[]]
  walkRuns(paragraph, { bold: false }, segments)
  return segments
}

function walkRuns(nodes: XmlNode[], inherited: RunStyle, segments: Piece[][]): void {
  for (const node of nodes) {
    const tag = tagOf(node)
    if (!tag) continue
    const name = localName(tag)
    const children = childrenOf(node, tag)

    switch (name) {
      // Formatting containers, not content.
      case 'pPr':
      case 'rPr':
        continue
      // Field instructions and tracked deletions are text in the file that is
      // not text in the document. Emitting them would put words on the page
      // that the user cannot see.
      case 'instrText':
      case 'delText':
      case 'delInstrText':
        continue
      case 'r':
        walkRuns(children, runStyle(children, inherited), segments)
        continue
      case 't':
      case 'noBreakHyphen':
        segments[segments.length - 1].push({
          text: name === 't' ? textOf(children) : '-',
          style: inherited,
        })
        continue
      case 'tab':
        // Kept as a tab rather than a space: it survives whitespace
        // normalisation identically, and a tab is the signal that a date was
        // right-aligned, which a shared structurer may want.
        segments[segments.length - 1].push({ text: '\t', style: inherited })
        continue
      case 'br':
      case 'cr':
        segments.push([])
        continue
      default:
        // Hyperlinks, `w:ins`, smart tags, content controls: transparent
        // wrappers around runs.
        walkRuns(children, inherited, segments)
    }
  }
}

function runStyle(rPrHolder: XmlNode[], inherited: RunStyle): RunStyle {
  const rPr = rPrHolder.find((node) => localName(tagOf(node) ?? '') === 'rPr')
  if (!rPr) return inherited

  const style: RunStyle = { ...inherited }

  for (const node of childrenOf(rPr, tagOf(rPr) as string)) {
    switch (localName(tagOf(node) ?? '')) {
      case 'sz': {
        const halfPoints = Number(attr(node, 'val') ?? NaN)
        if (Number.isFinite(halfPoints) && halfPoints > 0) {
          style.sizePt = halfPoints / HALF_POINTS_PER_POINT
        }
        break
      }
      case 'rFonts':
        style.font = attr(node, 'ascii') ?? attr(node, 'hAnsi') ?? attr(node, 'cs') ?? style.font
        break
      case 'b':
        style.bold = isOn(attr(node, 'val'))
        break
    }
  }

  return style
}

function toLine(
  segment: Piece[],
  props: ParagraphProps,
  styleSize: number,
  section: number,
  y: number,
): SourceLine | null {
  const raw = segment.map((piece) => piece.text).join('').trim()
  if (!raw) return null

  // The glyph is dropped and `isListItem` carries the fact instead, so that a
  // bullet typed as text and a real `w:numPr` item produce identical `text`.
  // Downstream cares whether a line is a bullet, never how it was authored.
  const typed = TYPED_BULLET.test(raw)
  const text = typed ? raw.replace(TYPED_BULLET, '').trim() : raw

  const written = segment.filter((piece) => piece.text.trim() !== '')
  const dominant = written.reduce<Piece | undefined>(
    (best, piece) => (!best || piece.text.length > best.text.length ? piece : best),
    undefined,
  )
  const font = dominant?.style.font ?? props.styleId ?? IMPLICIT_STYLE_ID

  // An explicit `w:sz` wins over the synthesised style size even when it is
  // smaller — small print in a heading is a real thing a document can say.
  const sizes = written.map((piece) => piece.style.sizePt ?? styleSize)

  return {
    text,
    page: section,
    y,
    x: props.indentPt,
    right: UNMEASURED_RIGHT_EDGE_PT,
    fontSize: sizes.length ? Math.max(...sizes) : styleSize,
    fontName: dominant?.style.bold ? `${font}-bold` : font,
    isListItem: props.isList || typed,
  }
}

/** `<w:b/>`, `<w:b w:val="1"/>` and `<w:b w:val="0"/>` all have to be read right. */
function isOn(value: string | undefined): boolean {
  return value !== '0' && value !== 'false' && value !== 'off'
}

/** LibreOffice escapes spaces in style ids as `_20_`; Word just omits them. */
function normaliseStyleId(styleId: string | undefined): string {
  if (!styleId) return ''
  return styleId.replace(/_20_/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/* -------------------------------------------------------------------------- */
/* XML shape                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * fast-xml-parser's `preserveOrder` shape: an array of nodes, each carrying one
 * tag key plus an optional `:@` attribute bag. Document order is the whole
 * reason for the mode — a paragraph interleaves runs with hyperlinks, and the
 * grouped-by-tag-name default would scramble a contact line.
 */
type XmlNode = Record<string, unknown>

const ATTRIBUTES = ':@'
const TEXT = '#text'
const ATTRIBUTE_PREFIX = '@_'

function tagOf(node: XmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ATTRIBUTES) return key
  }
  return null
}

function childrenOf(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag]
  return Array.isArray(value) ? (value as XmlNode[]) : []
}

/**
 * Matches on local name, ignoring the namespace prefix.
 *
 * `w` is conventional, not required: an XML prefix is declaration-scoped, so a
 * generator may legitimately bind WordprocessingML to something else and
 * hardcoding `w:` would drop the entire document. The cost is that DrawingML's
 * `a:t` also matches `t`, so text inside an embedded chart can leak in as an
 * extra line — the right way to fail here, since a stray line costs nothing and
 * a missing one breaks the verbatim check.
 */
function localName(qualified: string): string {
  const colon = qualified.lastIndexOf(':')
  return colon === -1 ? qualified : qualified.slice(colon + 1)
}

function attr(node: XmlNode, name: string): string | undefined {
  const attributes = node[ATTRIBUTES]
  if (!attributes || typeof attributes !== 'object') return undefined

  for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
    const bare = key.startsWith(ATTRIBUTE_PREFIX) ? key.slice(ATTRIBUTE_PREFIX.length) : key
    if (localName(bare) === name) return String(value)
  }
  return undefined
}

function textOf(children: XmlNode[]): string {
  return children.map((child) => (TEXT in child ? String(child[TEXT]) : '')).join('')
}

/* -------------------------------------------------------------------------- */
/* Zip container                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Enough zip to find one entry.
 *
 * A .docx is always a plain deflate archive of a handful of small files, so the
 * exotic corners of the format — zip64, encryption, split volumes — are
 * refusals rather than features. The central directory is read for sizes
 * instead of the local header because a streamed zip leaves those fields zero
 * there, which is a real bug in naive readers.
 */
const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const EOCD_SIZE = 22
/** A trailing comment can be 64 KB, and the EOCD sits in front of it. */
const MAX_EOCD_SCAN = EOCD_SIZE + 0xffff
const STORED = 0
const DEFLATED = 8
/** The sentinel that says "the real value is in a zip64 extra field". */
const ZIP64_SENTINEL = 0xffffffff

function readZipEntry(bytes: Uint8Array, name: string): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(view, bytes.byteLength)
  if (eocd < 0) throw new ResumeImportError(NOT_A_DOCX)

  const entries = view.getUint16(eocd + 10, true)
  const decoder = new TextDecoder()
  let cursor = view.getUint32(eocd + 16, true)

  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new ResumeImportError(NOT_A_DOCX)
    }

    const nameLength = view.getUint16(cursor + 28, true)
    const entryName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    if (entryName === name) {
      return readEntryData(
        bytes,
        view,
        view.getUint32(cursor + 42, true),
        view.getUint16(cursor + 10, true),
        view.getUint32(cursor + 20, true),
      )
    }

    cursor +=
      46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
  }

  return null
}

/**
 * Scans backwards for the end-of-central-directory record.
 *
 * The comment-length check is not paranoia: the signature is four bytes and a
 * file comment may contain them, and a backwards scan would otherwise stop on
 * the decoy that sits *after* the genuine record.
 */
function findEocd(view: DataView, length: number): number {
  const floor = Math.max(0, length - MAX_EOCD_SCAN)
  for (let offset = length - EOCD_SIZE; offset >= floor; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue
    if (view.getUint16(offset + 20, true) === length - offset - EOCD_SIZE) return offset
  }
  return -1
}

function readEntryData(
  bytes: Uint8Array,
  view: DataView,
  localOffset: number,
  method: number,
  compressedSize: number,
): Uint8Array {
  if (localOffset === ZIP64_SENTINEL || compressedSize === ZIP64_SENTINEL) {
    throw new ResumeImportError(NOT_A_DOCX)
  }
  if (localOffset + 30 > bytes.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
    throw new ResumeImportError(NOT_A_DOCX)
  }

  const start =
    localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
  const data = bytes.subarray(start, start + compressedSize)

  if (method === STORED) return data
  if (method !== DEFLATED) throw new ResumeImportError(NOT_A_DOCX)

  try {
    return inflateRawSync(data)
  } catch (error) {
    throw new ResumeImportError(NOT_A_DOCX, { cause: error })
  }
}
