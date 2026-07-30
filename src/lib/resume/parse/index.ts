import { ResumeImportError, scoreConfidence, type ImportedResume } from '../import-core'

import { readPdf } from './blocks'
import { readDocx } from './docx'
import { structureResume } from './structure'

/**
 * Keyless résumé import — the whole point of this directory.
 *
 * Reading a document's text was always free and local; only *structuring* it
 * needed a model, and a model that structures can also invent. So this path
 * reads structure out of the document's own typography instead. It cannot
 * fabricate a job title, which means `scoreConfidence()` — written to catch a
 * model putting words in the user's mouth — reports every field as verbatim.
 *
 * Nothing here requires a key, touches the network, or writes to the database.
 */

export type { SourceDocument, SourceLine } from './blocks'
export { readPdf } from './blocks'
export { readDocx } from './docx'
export { structureResume } from './structure'

/** A résumé we can read without a model. */
export type ReadableKind = 'pdf' | 'docx'

const PDF_MAGIC = '%PDF'
/** Every DOCX is a zip, and every zip starts `PK\x03\x04`. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
/** Legacy binary `.doc` — an OLE2 compound file, nothing like a DOCX. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte)
}

/**
 * What kind of document this is, by content first and name second.
 *
 * Content first because a browser's `File.type` is unreliable and an extension
 * is a claim rather than a fact — someone exporting from a tool that names a PDF
 * `.docx` should still get a working import rather than a confusing error.
 */
export function readableKind(bytes: Uint8Array, fileName = ''): ReadableKind | null {
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 4))
  if (header.startsWith(PDF_MAGIC)) return 'pdf'
  if (startsWith(bytes, ZIP_MAGIC)) return 'docx'

  // Named like something we read but shaped like nothing we recognise: fall back
  // to the extension so the reader itself can produce the specific complaint.
  if (/\.pdf$/i.test(fileName)) return 'pdf'
  if (/\.docx$/i.test(fileName)) return 'docx'
  return null
}

/** True for a legacy `.doc`, which needs its own message rather than "corrupt". */
export function isLegacyDoc(bytes: Uint8Array): boolean {
  return startsWith(bytes, OLE2_MAGIC)
}

export async function parseResumeFile(
  file: Buffer | Uint8Array,
  fileName = '',
): Promise<ImportedResume> {
  const bytes = new Uint8Array(file)

  if (isLegacyDoc(bytes)) {
    throw new ResumeImportError(
      'That is a legacy .doc file. Open it and re-save as .docx or PDF, then import it.',
    )
  }

  const kind = readableKind(bytes, fileName)
  if (!kind) {
    throw new ResumeImportError(
      `“${fileName || 'That file'}” is not a PDF or a .docx. Export your résumé as one of those, or start from a blank résumé.`,
    )
  }

  const doc = kind === 'pdf' ? await readPdf(bytes) : await readDocx(bytes)

  if (!doc.text.trim()) {
    // A PDF of scanned images has no text layer at all. Saying so beats
    // returning an empty résumé and letting the user wonder what went wrong.
    throw new ResumeImportError(
      kind === 'pdf'
        ? 'This PDF has no text layer — it looks like a scan. Export a text PDF, or start from a blank résumé.'
        : 'That .docx has no text in it. Check the file, or start from a blank résumé.',
    )
  }

  const content = structureResume(doc)

  return { content, fieldConfidence: scoreConfidence(content, doc.text), text: doc.text }
}
