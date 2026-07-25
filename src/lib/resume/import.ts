import { asResolvedLlm, type LlmLike } from '@/lib/llm'
import { parseResumeMessage, parseResumeSystem } from '@/lib/llm/prompts/resume'
import { runPrompt } from '@/lib/llm/prompts'

import { parseResumeContent, type ResumeContent } from './schema'

/**
 * PDF import — the first thing a new user does, and the moment hunt earns or
 * loses their trust.
 *
 * The pipeline is deliberately boring: extract the text layer, hand it to a
 * model with a copy-it-verbatim prompt, validate the JSON against the schema.
 * The interesting part is `fieldConfidence`: every extracted string is checked
 * back against the PDF text, so the review screen can flag the fields the model
 * produced but the document doesn't literally contain. That is a fact we can
 * measure, unlike a model's self-reported confidence, which is a vibe.
 */

export interface ImportedResume {
  content: ResumeContent
  /**
   * Leaf path -> 0..1. 1 means the value appears verbatim in the PDF text;
   * lower means it was inferred or reformatted and deserves an amber flag.
   */
  fieldConfidence: Record<string, number>
  /** The raw text layer, kept so the review screen can show the source. */
  text: string
}

export class ResumeImportError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'ResumeImportError'
  }
}

/** Confidence for a value the document doesn't literally contain. */
const INFERRED_CONFIDENCE = 0.5
/** Dates and short values get reformatted legitimately; don't cry wolf. */
const REFORMATTED_CONFIDENCE = 0.8

const DATE_KEYS = new Set(['start', 'end'])

export async function extractPdfText(pdf: Buffer | Uint8Array): Promise<string> {
  // Lazily imported: unpdf pulls in the whole pdf.js worker, which has no
  // business loading in a request that isn't importing a résumé.
  const { extractText, getDocumentProxy } = await import('unpdf')

  try {
    const document = await getDocumentProxy(new Uint8Array(pdf))
    const { text } = await extractText(document, { mergePages: true })
    return dehyphenate((Array.isArray(text) ? text.join('\n') : text).trim())
  } catch (error) {
    throw new ResumeImportError('That file could not be read as a PDF.', { cause: error })
  }
}

/**
 * Re-joins words the typesetter split across a line ("down-\ntime").
 *
 * Only applied when the next line starts lowercase, which is the signal that
 * the break is a hyphenation and not a real compound — "on-call" never appears
 * as "on-\nCall". Doing this here rather than asking the model to do it keeps a
 * mechanical problem mechanical.
 */
function dehyphenate(text: string): string {
  return text.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
}

/** Whitespace and typographic variants are noise when matching against a PDF. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Walks the parsed content and scores every leaf string against the source text. */
function scoreConfidence(content: ResumeContent, text: string): Record<string, number> {
  const haystack = normalise(text)
  const scores: Record<string, number> = {}

  const visit = (value: unknown, path: string, key: string) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, key))
      return
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) {
        visit(child, path ? `${path}.${childKey}` : childKey, childKey)
      }
      return
    }
    if (typeof value !== 'string' || value === '') return

    const needle = normalise(value)
    if (haystack.includes(needle)) {
      scores[path] = 1
      return
    }
    scores[path] = DATE_KEYS.has(key) ? REFORMATTED_CONFIDENCE : INFERRED_CONFIDENCE
  }

  visit(content, '', '')
  return scores
}

/** Models occasionally wrap JSON in prose or fences however firmly you ask. */
export function extractJsonObject(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced?.[1] ?? reply).trim()

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new ResumeImportError('The model did not return a résumé object.')
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch (error) {
    throw new ResumeImportError('The model returned malformed JSON.', { cause: error })
  }
}

export async function importResumePdf(
  pdf: Buffer | Uint8Array,
  llm: LlmLike,
  options: { maxTokens?: number } = {},
): Promise<ImportedResume> {
  const text = await extractPdfText(pdf)
  if (!text) {
    throw new ResumeImportError(
      'This PDF has no text layer — it looks like a scan. Export a text PDF, or start from a blank résumé.',
    )
  }

  const { provider, model } = asResolvedLlm(llm)

  const response = await runPrompt({
    llm: provider,
    model,
    kind: 'parse_resume',
    system: parseResumeSystem(),
    messages: [{ role: 'user', content: parseResumeMessage(text) }],
    maxTokens: options.maxTokens ?? 8000,
  })

  let content: ResumeContent
  try {
    content = parseResumeContent(extractJsonObject(response.text))
  } catch (error) {
    if (error instanceof ResumeImportError) throw error
    throw new ResumeImportError(
      'The parsed résumé did not match the expected shape — nothing was imported.',
      { cause: error },
    )
  }

  return { content, fieldConfidence: scoreConfidence(content, text), text }
}
