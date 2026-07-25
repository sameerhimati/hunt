import { extractPdfText } from '@/lib/resume/import'

import type { ParserInput, ResumeParserAdapter } from '../parser-adapter'
import type { ParsedResume } from '../types'

/**
 * The naive ATS parser, on purpose.
 *
 * Read `parser-adapter.ts` for why this is hand-rolled rather than a
 * dependency (short version: no maintained JS résumé parser exists, and the one
 * good open-source implementation is AGPL app source, not a package). What
 * matters here is the *method*: pull the PDF's text layer, then rebuild
 * sections, dates and contacts from line shape and regex — no model, no
 * semantics, no benefit of the doubt.
 *
 * That is precisely what a keyword-matching ATS does to a résumé, so what this
 * loses is a fair estimate of what they lose. Every heuristic below is
 * deliberately literal: an unrecognised section heading folds into the section
 * above it, a two-column line splits on the gutter or not at all, "Mar 2023"
 * becomes `2023-03` only because that mapping is mechanical. When one of those
 * gives up, `parse-fidelity` reports the field as dropped, which is the true
 * answer — the machine reading your PDF gave up too.
 *
 * Measured end to end (Tectonic render of `gates/fixtures/resume/alex-chen.json`
 * on Jake's template, July 2026): **4 of 48 fields dropped**, all four the same
 * failure — `\entry`'s second row puts the job title and the city in one
 * `tabularx` line, and the PDF text layer keeps no trace of the gutter between
 * them, so `Senior Backend Engineer` and `San Francisco, CA` come back glued
 * together. Nothing here tries to unglue them: every token on that line is
 * capitalised, so telling the title from the city needs a gazetteer, not a
 * regex, and an ATS doesn't have one either. That reading is the check working
 * — it is pointing at a real weakness in the template's two-column row.
 */

type ParsedExperience = NonNullable<ParsedResume['experience']>[number]
type ParsedEducation = NonNullable<ParsedResume['education']>[number]
type ParsedProject = NonNullable<ParsedResume['projects']>[number]
type ParsedSkillGroup = NonNullable<ParsedResume['skills']>[number]
type ParsedCustom = NonNullable<ParsedResume['custom']>[number]

export class HeuristicResumeParser implements ResumeParserAdapter {
  readonly id = 'heuristic-text-layer'
  readonly requiresRender = true

  async parse(input: Buffer | ParserInput): Promise<ParsedResume> {
    const text = await textOf(input)
    return parseResumeText(text)
  }
}

async function textOf(input: Buffer | ParserInput): Promise<string> {
  if (Buffer.isBuffer(input)) return extractPdfText(input)
  if (input.text) return input.text
  if (input.pdf) return extractPdfText(input.pdf)

  throw new Error('The ATS parser was given no document to read.')
}

/* ------------------------------------------------------------------ lines */

const BULLET = /^[\s]*[•·▪‣∙◦*+–—-]\s+/
/** The gutter a two-column entry line leaves behind in the text layer. */
const GUTTER = /\s{2,}/
/** `San Francisco, CA` / `Remote — US` — the right-hand cell of an entry line. */
const PLACE = /^(?:[A-Z][\w.'-]*(?:\s+[\w.'-]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+)|Remote\b.*)$/

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{4}-\\d{2}|\\d{1,2}/\\d{4}|\\d{4})`
const OPEN_END = '(?:present|current|now|ongoing)'
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:[–—-]{1,3}|to)\\s*(${DATE}|${OPEN_END})`, 'i')

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/
const PHONE = /\+?\d[\d\s().-]{7,}\d/
const URL = /(?:https?:\/\/|www\.)\S+|(?:[\w-]+\.)+(?:com|org|net|io|dev|me|co)\/\S+/i

/** Contact lines arrive as one string joined by the template's separator. */
const CONTACT_SEPARATOR = /\s*[·⋅|•]\s*/

type SectionKind = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'custom'

const SECTION_ALIASES: { kind: SectionKind; pattern: RegExp }[] = [
  { kind: 'summary', pattern: /^(summary|profile|about|objective)$/ },
  { kind: 'experience', pattern: /^((work|professional|relevant)\s+)?experience$|^employment(\s+history)?$/ },
  { kind: 'education', pattern: /^education$/ },
  { kind: 'skills', pattern: /^((technical|core)\s+)?skills$|^technologies$/ },
  { kind: 'projects', pattern: /^((personal|side|open[\s-]?source)\s+)?projects$/ },
]

interface Block {
  kind: SectionKind | 'header'
  title: string
  lines: string[]
}

/**
 * PDF text → a résumé shaped like the one we rendered, minus whatever the text
 * layer no longer carries. Exported because it is the whole parser: given the
 * text, no IO is involved and it is directly testable.
 */
export function parseResumeText(raw: string): ParsedResume {
  // Runs of spaces survive this on purpose: the gutter between a two-column
  // entry's cells is the only thing in a text layer that says "these were not
  // one sentence", and collapsing it is how naive parsers glue a job title to a
  // city. Every other whitespace flavour (tabs, non-breaking spaces) becomes a
  // plain space.
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S ]+/g, ' ').replace(/^ +| +$/g, ''))
    .filter(Boolean)

  const blocks = splitIntoBlocks(lines)
  const header = blocks.find((block) => block.kind === 'header')?.lines ?? []

  const parsed: ParsedResume = {
    basics: readBasics(header),
    experience: [],
    education: [],
    skills: [],
    projects: [],
    custom: [],
  }

  for (const block of blocks) {
    switch (block.kind) {
      case 'summary':
        parsed.basics = { ...parsed.basics, summary: block.lines.join(' ') || undefined }
        break
      case 'experience':
        parsed.experience = readExperience(block.lines)
        break
      case 'education':
        parsed.education = readEducation(block.lines)
        break
      case 'skills':
        parsed.skills = readSkills(block.lines)
        break
      case 'projects':
        parsed.projects = readProjects(block.lines)
        break
      case 'custom':
        parsed.custom?.push(readCustom(block))
        break
      default:
        break
    }
  }

  return parsed
}

/**
 * Cuts the flat line list at every heading.
 *
 * Known section names are recognised in any case (small caps come back out of a
 * PDF as either). An unknown heading is only taken as one when it is ALL CAPS
 * and we are already past the header — otherwise a small-capped *name* at the
 * top ("ALEX CHEN") would open a section and take the person's name with it.
 */
function splitIntoBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [{ kind: 'header', title: '', lines: [] }]

  for (const line of lines) {
    const started = blocks.length > 1
    const heading = headingOf(line, started)
    if (heading) {
      blocks.push({ ...heading, lines: [] })
      continue
    }
    blocks[blocks.length - 1].lines.push(line)
  }

  return blocks
}

function headingOf(line: string, allowUnknown: boolean): { kind: SectionKind; title: string } | null {
  if (BULLET.test(line)) return null

  const title = line.replace(/[:\s]+$/, '').trim()
  if (!title || title.length > 40 || /[@,]/.test(title) || /\d/.test(title)) return null

  const lower = title.toLowerCase()
  for (const { kind, pattern } of SECTION_ALIASES) {
    if (pattern.test(lower)) return { kind, title }
  }

  const words = title.split(/\s+/).length
  if (allowUnknown && words <= 4 && title === title.toUpperCase() && /[A-Z]/.test(title)) {
    return { kind: 'custom', title }
  }
  return null
}

/* ----------------------------------------------------------------- basics */

function readBasics(header: string[]): ParsedResume['basics'] {
  const joined = header.join(' · ')
  const segments = header.flatMap((line) => line.split(CONTACT_SEPARATOR)).map((part) => part.trim())

  const email = EMAIL.exec(joined)?.[0]
  const phone = PHONE.exec(joined.replace(EMAIL, ''))?.[0]?.trim()
  const url = URL.exec(joined)?.[0]?.replace(/[.,)]+$/, '')
  const location = segments.find((part) => PLACE.test(part) && part !== segments[0])

  const name = header[0]
  const label = segments
    .slice(1)
    .find(
      (part) =>
        part.length > 2 &&
        part.length <= 60 &&
        !/\d|@/.test(part) &&
        part !== location &&
        part !== url,
    )

  return { name, label, email, phone, url, location }
}

/* ------------------------------------------------------------- experience */

function readExperience(lines: string[]): ParsedExperience[] {
  const entries: ParsedExperience[] = []

  for (const line of lines) {
    const current = entries[entries.length - 1]
    const bullet = stripBullet(line)

    if (bullet !== null) {
      current?.bullets?.push(bullet)
      continue
    }

    const dates = DATE_RANGE.exec(line)
    if (dates) {
      const [company] = splitOnGutter(line.replace(dates[0], '').trim())
      entries.push({
        company: trimSeparators(company) || undefined,
        ...readRange(dates),
        bullets: [],
      })
      continue
    }

    if (current && !current.title) {
      const [title, place] = splitOnGutter(line)
      current.title = title || undefined
      current.location = place
      continue
    }

    // Past the entry head with no marker: a wrapped bullet if it reads like a
    // continuation, otherwise a bullet whose marker the text layer swallowed.
    appendLoose(current?.bullets, line)
  }

  return entries
}

/* -------------------------------------------------------------- education */

function readEducation(lines: string[]): ParsedEducation[] {
  const entries: ParsedEducation[] = []

  for (const line of lines) {
    const current = entries[entries.length - 1]
    const bullet = stripBullet(line)

    if (bullet !== null) {
      current?.bullets?.push(bullet)
      continue
    }

    const dates = DATE_RANGE.exec(line)
    if (dates) {
      const [institution] = splitOnGutter(line.replace(dates[0], '').trim())
      entries.push({
        institution: trimSeparators(institution) || undefined,
        ...readRange(dates),
        bullets: [],
      })
      continue
    }

    if (current && !current.degree) {
      const [degree, place] = splitOnGutter(line)
      current.degree = degree || undefined
      current.location = place
      continue
    }

    appendLoose(current?.bullets, line)
  }

  return entries
}

/* ----------------------------------------------------------------- skills */

function readSkills(lines: string[]): ParsedSkillGroup[] {
  return lines.map((line) => {
    const text = stripBullet(line) ?? line
    const labelled = /^(.{2,40}?):\s*(.+)$/.exec(text)

    return {
      category: labelled?.[1]?.trim() || undefined,
      items: (labelled?.[2] ?? text)
        .split(/[,;·|]/)
        .map((item) => item.trim())
        .filter(Boolean),
    }
  })
}

/* --------------------------------------------------------------- projects */

function readProjects(lines: string[]): ParsedProject[] {
  const entries: ParsedProject[] = []

  for (const line of lines) {
    const current = entries[entries.length - 1]
    const bullet = stripBullet(line)

    if (bullet !== null) {
      current?.bullets?.push(bullet)
      continue
    }

    const link = URL.exec(line)
    if (link && link[0].length >= line.trim().length - 2) {
      if (current) current.url = link[0].replace(/[.,)]+$/, '')
      continue
    }

    const [name, description] = line.split(/\s+[—–-]{1,3}\s+/, 2)
    entries.push({ name: name?.trim() || undefined, description: description?.trim(), bullets: [] })
  }

  return entries
}

/* ----------------------------------------------------------------- custom */

function readCustom(block: Block): ParsedCustom {
  return {
    title: block.title,
    bullets: block.lines.map((line) => stripBullet(line) ?? line),
  }
}

/* ---------------------------------------------------------------- helpers */

function stripBullet(line: string): string | null {
  return BULLET.test(line) ? line.replace(BULLET, '').trim() : null
}

/**
 * Splits a two-column line at the gutter, keeping the right cell only when it
 * reads like a place — otherwise the left cell was simply a wide one.
 */
function splitOnGutter(line: string): [string, string | undefined] {
  const parts = line.split(GUTTER).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return [line.trim(), undefined]

  const tail = parts[parts.length - 1]
  if (!PLACE.test(tail)) return [parts.join(' '), undefined]

  return [parts.slice(0, -1).join(' '), tail]
}

function trimSeparators(value: string): string {
  return value.replace(/^[\s|·—–-]+|[\s|·—–-]+$/g, '').trim()
}

function readRange(match: RegExpExecArray): { start?: string; end?: string } {
  const end = normaliseDate(match[2])
  return { start: normaliseDate(match[1]), end: end === 'present' ? undefined : end }
}

/** `Mar 2023` → `2023-03`; a bare year and anything unrecognised pass through. */
function normaliseDate(value: string): string {
  const token = value.trim().replace(/\.$/, '')
  if (new RegExp(`^${OPEN_END}$`, 'i').test(token)) return 'present'

  const monthYear = /^([A-Za-z]+)\s+(\d{4})$/.exec(token)
  if (monthYear) {
    const month = MONTHS[monthYear[1].slice(0, 3).toLowerCase()]
    if (month) return `${monthYear[2]}-${month}`
  }

  const numeric = /^(\d{1,2})\/(\d{4})$/.exec(token)
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, '0')}`

  return token
}

/**
 * A line inside an entry that carried no bullet marker. Lowercase or
 * punctuation-led means the typesetter wrapped the previous bullet; anything
 * else is treated as a bullet in its own right rather than thrown away.
 */
function appendLoose(bullets: string[] | undefined | null, line: string): void {
  if (!bullets) return

  const previous = bullets[bullets.length - 1]
  if (previous && /^[a-z(]/.test(line)) {
    bullets[bullets.length - 1] = `${previous} ${line}`
    return
  }
  bullets.push(line)
}
