import { isTestMode } from '@/lib/testmode/env'

import type { ParsedResume, ResumeParser } from './types'

/**
 * The ATS parser seam — and the answer to open question #4 ("pick the
 * open-source résumé parser").
 *
 * **The verdict: there is nothing to pick.** The JS landscape (surveyed July
 * 2026) is:
 *
 *  - `resume-parser`, `simple-resume-parser`, `easy-resume-parser`,
 *    `resume-parser-object` — the npm packages that come up first are all
 *    ~7 years unpublished, most of them `pdf.js`-plus-regex wrappers wearing a
 *    library's clothes. Depending on an abandoned parser to tell users what
 *    ATSes see would be borrowing someone else's stale guesses.
 *  - **OpenResume** (`xitanggg/open-resume`) is the only genuinely good
 *    open-source résumé parser, and its algorithm is the right one: read text
 *    items with `pdf.js`, group them into lines, group lines into sections,
 *    score each line's features per attribute. But it ships as app source
 *    inside a Next.js app (`/lib/parse-resume-from-pdf`), not as a package, and
 *    it is **AGPL-3.0** — hunt is MIT, so vendoring it is a licence change, not
 *    a dependency.
 *  - Affinda / Sovren / RChilli / HireAbility are commercial HTTP APIs: another
 *    key, another network hop, and the user's résumé leaving the machine — for
 *    a check whose entire selling point is that it runs locally.
 *  - The Python tools (`pyresparser`, `resume-parser`) need a Python runtime
 *    beside Node and are themselves unmaintained spaCy-2 era code.
 *
 * So we ship `HeuristicResumeParser`: extract the PDF text layer with `unpdf`
 * (the same `pdf.js` core OpenResume uses, already a dependency for import) and
 * rebuild sections, dates and contacts with regex heuristics. That is not a
 * compromise — **that is what a naive ATS actually does**, and the UI says so
 * in those words rather than implying we run Workday's parser. No new
 * dependency, no licence entanglement, no network.
 *
 * What we deliberately do NOT do is re-parse with an LLM. A model would
 * reconstruct fields a keyword-matching ATS would never recover, so the check
 * would measure the model instead of the document and report a comforting
 * number that means nothing.
 *
 * This resolver is deliberately *not* wired through
 * `src/lib/providers/registry.ts` or `src/lib/adapters/factory.ts`: those seams
 * are for keyed, user-configured providers that can be missing or degraded. The
 * parser is internal machinery with no key and no settings row, and putting it
 * in the registry would put a provider card in Settings that nobody can
 * configure.
 */

/**
 * What a parser is handed. `pdf` is the rendered document; `text` lets a caller
 * that already has the text layer skip the extraction (and lets the Fake twin
 * be handed neither). A bare `Buffer` is accepted too, so an external
 * `ResumeParser` — the `input.parser` override in `CheckRunInput` — stays
 * callable through the same method.
 */
export interface ParserInput {
  pdf?: Buffer
  text?: string
}

export interface ResumeParserAdapter extends ResumeParser {
  id: string
  /**
   * False when the parser needs no rendered PDF. The runner reads this before
   * deciding to spend a Tectonic compile — which is what keeps the gate and
   * e2e checks run from hanging on LaTeX.
   */
  requiresRender: boolean
  parse(input: Buffer | ParserInput): Promise<ParsedResume>
}

/**
 * The parser the check uses: the fixture-backed twin under `HUNT_TEST_MODE`,
 * the heuristic one otherwise. Both imports are lazy — `heuristic` pulls in the
 * PDF text extractor and `fake` reads fixtures off disk, and neither belongs in
 * a bundle that isn't running this check.
 */
export async function resolveResumeParser(): Promise<ResumeParserAdapter> {
  if (isTestMode()) {
    const { FakeResumeParser } = await import('./parsers/fake')
    return new FakeResumeParser()
  }

  const { HeuristicResumeParser } = await import('./parsers/heuristic')
  return new HeuristicResumeParser()
}

/**
 * True for a parser that reads no rendered document — the Fake twin, and any
 * future parser working straight off structured text. A parser that never
 * declared itself is assumed to want a PDF, because the plain `ResumeParser`
 * interface takes a `Buffer` and nothing else.
 */
export function isRenderlessParser(parser: ResumeParser): parser is ResumeParserAdapter {
  return (parser as Partial<ResumeParserAdapter>).requiresRender === false
}
