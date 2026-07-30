import type { ResumeContent } from './schema'

/**
 * The parts of importing that no model is involved in.
 *
 * Split out of `import.ts` because that module reaches the LLM provider layer,
 * and the keyless readers in `parse/` must not: a no-key path that drags the
 * whole model graph in behind it is the kind of thing that quietly becomes a
 * dependency nobody can remove. Everything here is a pure function of text.
 */

export interface ImportedResume {
  content: ResumeContent
  /**
   * Leaf path -> 0..1. 1 means the value appears verbatim in the source text;
   * lower means it was inferred or reformatted and deserves an amber flag.
   */
  fieldConfidence: Record<string, number>
  /** The raw text, kept so the review screen can show the source. */
  text: string
}

export class ResumeImportError extends Error {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, options)
    this.name = 'ResumeImportError'
  }
}

/** Confidence for a value the document doesn't literally contain. */
export const INFERRED_CONFIDENCE = 0.5
/** Dates and short values get reformatted legitimately; don't cry wolf. */
export const REFORMATTED_CONFIDENCE = 0.8

const DATE_KEYS = new Set(['start', 'end'])

/** Whitespace and typographic variants are noise when matching against a document. */
export function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Walks the parsed content and scores every leaf string against the source text.
 *
 * This is the measurement the review screen's amber flags are built on, and it
 * is a fact rather than a model's opinion of itself. It also happens to be the
 * strongest argument for the keyless path: a structurer that only copies
 * verbatim spans scores 1 everywhere, so the check written to catch invention
 * ends up certifying the parser that cannot invent.
 */
export function scoreConfidence(
  content: ResumeContent,
  text: string,
): Record<string, number> {
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
