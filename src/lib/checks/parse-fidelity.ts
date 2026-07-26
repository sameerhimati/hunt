import { resolvePath, type ResumeContent } from '@/lib/resume/schema'

import { isRenderlessParser, resolveResumeParser } from './parser-adapter'
import type {
  CheckOutcome,
  CheckRunInput,
  CheckVersion,
  ParsedResume,
  ParseFidelityResult,
  ResumeParser,
} from './types'

/**
 * Parse fidelity — the one check that measures the machine rather than the
 * document.
 *
 * Render the version to PDF, feed that PDF back through an ATS-grade parser
 * (`parser-adapter.ts` explains what that is and why it is deliberately naive),
 * and compare what came out against the structured data that went in. Every
 * field the parser lost is a field the employer's ATS probably loses too — that
 * is the whole claim, and unlike a score it is checkable: the user can open the
 * PDF and see the merged dates for themselves.
 *
 * `parseFidelity` is the pure comparison and does no IO, so the reading is
 * reproducible from the two documents alone. Zero dropped is the only `pass`;
 * a handful is a `warn`; losing a fifth of the document, or a whole entry, is a
 * `fail` because at that point the ATS is reading a different résumé.
 */

export interface ParseFidelityInput {
  content: ResumeContent
  /** What the parser handed back — same shape, holes where it lost fields. */
  parsed: ParsedResume
}

/** Above this share of lost fields the document is no longer being read. */
const FAIL_RATIO = 0.2

export function parseFidelity({ content, parsed }: ParseFidelityInput): ParseFidelityResult {
  const dropped: string[] = []
  let checked = 0

  for (const [path, value] of leaves(content)) {
    checked += 1
    if (!survived(value, readPath(parsed, path))) dropped.push(path)
  }

  return { dropped, checked, verdict: verdictFor(dropped.length, checked, content, parsed) }
}

/** Runner slot: renders, re-parses via `input.parser`, then compares. */
export async function runParseFidelity(input: CheckRunInput): Promise<CheckOutcome> {
  try {
    const parser = input.parser ?? (await resolveResumeParser())
    const parsed = await reparse(parser, input.version)
    const result = parseFidelity({ content: input.version.content, parsed })

    return {
      kind: 'parse_fidelity',
      verdict: result.verdict,
      summary: `${result.dropped.length} of ${result.checked} fields dropped`,
      details: result,
    }
  } catch (error) {
    // A Tectonic failure or a parser that choked is this check's problem alone.
    // The card still appears and says it did not measure — never a quiet pass.
    return {
      kind: 'parse_fidelity',
      verdict: 'warn',
      summary: 'Not measured',
      details: { dropped: [], checked: 0, verdict: 'warn' } satisfies ParseFidelityResult,
      error: error instanceof Error ? error.message : 'The ATS parser could not read this résumé.',
    }
  }
}

/**
 * Renders only when the parser actually needs a document.
 *
 * The fixture-backed twin declares `requiresRender: false`, which is what keeps
 * the gate and the e2e checks run off the LaTeX compiler entirely — a check
 * that takes a minute to answer is a check nobody runs.
 */
async function reparse(parser: ResumeParser, version: CheckVersion): Promise<ParsedResume> {
  if (isRenderlessParser(parser)) return parser.parse({})

  const { renderToPdf } = await import('@/lib/resume/render')
  const { pdf } = await renderToPdf(version)
  return parser.parse(pdf)
}

/**
 * Every leaf of the source document, in stable path form (`basics.url`,
 * `experience[1].start`, `experience[0].bullets[2]`).
 *
 * Fields the user never filled in are skipped: a parser cannot lose what was
 * not on the page, and counting absences would inflate the denominator and
 * flatter the reading.
 */
function* leaves(value: unknown, path = ''): Generator<[string, string]> {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) yield* leaves(item, `${path}[${index}]`)
    return
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* leaves(child, path ? `${path}.${key}` : key)
    }
    return
  }

  if (typeof value === 'string' && value.trim()) yield [path, value]
}

/**
 * `ParsedResume` is structurally a `ResumeContent` with holes, and `resolvePath`
 * already returns undefined for anything that does not resolve — which is
 * exactly what a hole reads as.
 */
function readPath(parsed: ParsedResume, path: string): unknown {
  return resolvePath(parsed as ResumeContent, path)
}

/**
 * A field survived if the same text came back. Whitespace, quote and dash
 * variants are typesetting, not loss — the PDF renders an en dash for `--` and
 * the extractor hands it back that way. Anything else (nulled, emptied,
 * truncated, merged into its neighbour) counts as dropped, because from the
 * employer's side it is.
 */
function survived(expected: string, actual: unknown): boolean {
  return typeof actual === 'string' && normalise(actual) === normalise(expected)
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function verdictFor(
  dropped: number,
  checked: number,
  content: ResumeContent,
  parsed: ParsedResume,
): ParseFidelityResult['verdict'] {
  if (dropped === 0) return 'pass'
  if (structuralLoss(content, parsed)) return 'fail'
  return dropped / Math.max(checked, 1) > FAIL_RATIO ? 'fail' : 'warn'
}

/**
 * A whole entry or section that never came back — a job the ATS will not see at
 * all, rather than a field it garbled. Worth its own verdict because the fix is
 * different: garbled fields are a template tweak, a missing section means the
 * parser never found the heading.
 */
function structuralLoss(content: ResumeContent, parsed: ParsedResume): boolean {
  const sections = ['experience', 'education', 'skills', 'projects', 'custom'] as const

  return sections.some((section) => {
    const source = content[section]
    const returned = parsed[section]
    if (source.length === 0) return false
    return !Array.isArray(returned) || returned.length < source.length
  })
}
