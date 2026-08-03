import { asResolvedLlm, type LlmLike } from '@/lib/llm'
import { parseResumeMessage, parseResumeSystem } from '@/lib/llm/prompts/resume'
import { runPrompt } from '@/lib/llm/prompts'

import { ResumeImportError, scoreConfidence, type ImportedResume } from './import-core'
import { parseResumeContent, type ResumeContent } from './schema'

/**
 * The *model* import path — one of two, now.
 *
 * The pipeline is deliberately boring: extract the text layer, hand it to a
 * model with a copy-it-verbatim prompt, validate the JSON against the schema.
 * The interesting part is `fieldConfidence`: every extracted string is checked
 * back against the PDF text, so the review screen can flag the fields the model
 * produced but the document doesn't literally contain. That is a fact we can
 * measure, unlike a model's self-reported confidence, which is a vibe.
 *
 * `parse/` is the keyless twin, which reads structure out of the document's own
 * typography instead of asking a model to. It exists because requiring a key
 * here put one in front of the first thing a new user does — and because a
 * parser that only copies verbatim spans cannot invent, which this one can.
 * Shared, model-free pieces live in `import-core.ts` so that path stays clean of
 * the provider layer.
 */

// Re-exported so the many call sites that import these from here keep working;
// they moved to `import-core.ts` to get out of the LLM module graph.
export { ResumeImportError, scoreConfidence, type ImportedResume } from './import-core'

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

  return importResumeText(text, llm, options)
}

/**
 * The model path over text that has already been extracted.
 *
 * Split out of `importResumePdf` for the re-read action, which works from
 * `Resume.sourceText` because the original upload is not kept. It is the same
 * pipeline either way — the prompt has only ever seen the text layer, so
 * re-reading a stored source is not a degraded version of importing the file,
 * it is the identical call with the extraction step already done.
 *
 * The one thing it cannot do is re-run the *keyless* parser, which reads
 * typography and needs the bytes. That asymmetry is why the action is worded as
 * reading it again with a model rather than as a general re-import.
 */
export async function importResumeText(
  text: string,
  llm: LlmLike,
  options: { maxTokens?: number } = {},
): Promise<ImportedResume> {
  if (!text.trim()) {
    throw new ResumeImportError('There is no stored text for this résumé to read.')
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
