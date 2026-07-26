import fs from 'node:fs/promises'
import path from 'node:path'

import { dataDir } from '@/lib/paths'

import {
  UNSOURCED_FLAG,
  type CoverLetterCitation,
  type CoverLetterDraft,
  type CoverLetterParagraph,
} from './cover-letter'

/**
 * Where a cover letter lives: `./data/cover-letters/<applicationId>.md`.
 *
 * **Decision, flagged for review.** The letter is a file, not a Prisma model.
 * Three reasons, in the order they mattered:
 *
 *  1. `prisma/schema.prisma` is a wave-foundation seam, frozen for Wave 2. A
 *     `CoverLetter` table is a schema delta and therefore a foundation-level
 *     amendment for a later wave, not something a Phase-3 leaf may land — and
 *     Phase 3 needs no other schema change, so this is the only thing standing
 *     between the phase and a frozen file.
 *  2. A cover letter is a *document*. It is prose the user rereads, hand-edits,
 *     copies into an application form and wants after they stop using hunt.
 *     Markdown under `./data` is local-first in the way the product means it:
 *     inspectable in any editor, greppable, and backed up with the same folder
 *     as the database and the résumés (`src/lib/paths.ts`).
 *  3. Nothing queries letters. There is no "letters mentioning Kafka" screen and
 *     no join to write; the only access pattern is *this application's letter*,
 *     which is a filename.
 *
 * If review prefers a table, the migration and the store swap are mechanical —
 * the file format below carries exactly the fields a row would.
 *
 * **The format** is a letter first and a record second: paragraphs separated by
 * blank lines, with provenance in an HTML comment after each one. Comments are
 * invisible in every markdown renderer and survive a copy-paste of the rendered
 * text, so the user's letter is not polluted by hunt's bookkeeping — but open
 * the file in an editor and the sources are right there, in plain sight, which
 * is the honest version of "we tracked where this came from".
 *
 * The blank line is the paragraph boundary, in the file and in the tab. Split a
 * paragraph in two while editing and it loads back as two — both the user's,
 * since they wrote the split. Honouring the file's own structure over hunt's
 * bookkeeping is what makes hand-editing the letter in another editor work at
 * all, which is the point of storing it as a document.
 *
 * Snippets are deliberately not persisted: they are copies of the résumé, and a
 * stale copy of a document that lives two directories away is a lie waiting to
 * happen. A reloaded letter shows the citation path; the snippet comes back on
 * the next draft, resolved from the real content.
 */

const FOLDER = 'cover-letters'

/** cuid/uuid shapes only. This value comes off a URL, so it is validated, not trusted. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

const ANNOTATION = /^<!--\s*hunt:\s*(.*?)\s*-->$/

function coverLetterDir(): string {
  return path.join(dataDir(), FOLDER)
}

/** The file a letter lives in. Exported so the UI can tell the user where it is. */
export function coverLetterPath(applicationId: string): string {
  if (!SAFE_ID.test(applicationId)) {
    throw new Error(`"${applicationId}" is not an application id.`)
  }
  return path.join(coverLetterDir(), `${applicationId}.md`)
}

function annotate(paragraph: CoverLetterParagraph): string {
  const parts = [`origin=${paragraph.origin}`]
  if (paragraph.citations.length > 0) {
    parts.push(`cites=${paragraph.citations.map((citation) => citation.path).join(',')}`)
  }
  return `<!-- hunt: ${parts.join(' ')} -->`
}

/** The letter as it sits on disk. Pure, and the exact inverse of `fromMarkdown`. */
export function toMarkdown(draft: CoverLetterDraft): string {
  const front = [
    '---',
    `application: ${draft.applicationId}`,
    `saved: ${draft.savedAt ?? new Date().toISOString()}`,
    '---',
    '',
  ].join('\n')

  const body = draft.paragraphs
    .filter((paragraph) => paragraph.text.trim())
    .map((paragraph) => `${paragraph.text.trim()}\n\n${annotate(paragraph)}`)
    .join('\n\n')

  return `${front}\n${body}\n`
}

function parseAnnotation(line: string): { origin: 'model' | 'user'; paths: string[] } | null {
  const match = ANNOTATION.exec(line.trim())
  if (!match) return null

  let origin: 'model' | 'user' = 'user'
  let paths: string[] = []

  for (const token of match[1].split(/\s+/).filter(Boolean)) {
    const [key, value = ''] = token.split('=')
    if (key === 'origin' && value === 'model') origin = 'model'
    if (key === 'cites') paths = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  }

  return { origin, paths }
}

function citationFrom(cited: string): CoverLetterCitation {
  return { path: cited, source: cited.startsWith('job.') ? 'job' : 'resume' }
}

/**
 * Reads a letter back. Anything in the file hunt did not write — a paragraph the
 * user typed in their own editor, an annotation they deleted — is treated as
 * theirs: `origin: 'user'`, unflagged. The guard is about what hunt authored,
 * and a file the user edited by hand is not hunt's authorship (see rule 2 in
 * `./cover-letter.ts`).
 */
export function fromMarkdown(text: string, applicationId: string): CoverLetterDraft {
  const stripped = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  const savedAt = /^saved:\s*(.+)$/m.exec(text.split('---')[1] ?? '')?.[1]?.trim() ?? null

  const paragraphs: CoverLetterParagraph[] = []
  for (const block of stripped.split(/\n{2,}/)) {
    const trimmed = block.trim()
    if (!trimmed) continue

    const annotation = parseAnnotation(trimmed)
    if (annotation) {
      const previous = paragraphs[paragraphs.length - 1]
      if (!previous) continue

      previous.origin = annotation.origin
      previous.citations = annotation.paths.map(citationFrom)
      if (annotation.origin === 'model' && previous.citations.length === 0) {
        previous.flag = UNSOURCED_FLAG
      } else {
        delete previous.flag
      }
      continue
    }

    paragraphs.push({
      id: `p${paragraphs.length + 1}`,
      text: trimmed,
      citations: [],
      origin: 'user',
    })
  }

  return { applicationId, paragraphs, savedAt }
}

/**
 * Pins the letter to the application beside the résumé version. Returns the
 * draft as saved — with `savedAt` — so the caller shows a timestamp it can
 * trust rather than the one it hoped for.
 */
export async function saveCoverLetter(
  applicationId: string,
  draft: CoverLetterDraft,
): Promise<CoverLetterDraft> {
  const file = coverLetterPath(applicationId)
  const saved: CoverLetterDraft = {
    ...draft,
    applicationId,
    savedAt: new Date().toISOString(),
  }

  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, toMarkdown(saved), 'utf8')

  return saved
}

/** Null when this application has no letter yet — an absence, not an error. */
export async function loadCoverLetter(applicationId: string): Promise<CoverLetterDraft | null> {
  const file = coverLetterPath(applicationId)

  let text: string
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw cause
  }

  const draft = fromMarkdown(text, applicationId)
  return draft.paragraphs.length > 0 ? draft : null
}
