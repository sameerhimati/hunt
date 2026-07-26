import { readJsonFixture } from '@/lib/testmode/fixtures'

import type { ParserInput, ResumeParserAdapter } from '../parser-adapter'
import type { ParsedResume } from '../types'

/**
 * The fixture-backed twin of the ATS parser.
 *
 * It returns `gates/fixtures/checks/parse-fidelity-1.json` — alex-chen with
 * exactly the two degradations a text-layer parser really makes on the
 * committed résumé: the GitHub URL came back as plain text (`basics.url` null)
 * and the Plaid dates merged into one blob (`experience[1].start` null). That
 * makes the check deterministic at a *warn* with two named drops, which is the
 * reading the mockup narrates.
 *
 * `requiresRender` is false and load-bearing: the fake needs no document, so
 * the runner skips the Tectonic compile entirely and the gate's checks run
 * finishes in milliseconds instead of waiting on LaTeX.
 */
export class FakeResumeParser implements ResumeParserAdapter {
  readonly id = 'fake-parser'
  readonly requiresRender = false

  /** Every call the check made, so a test can assert it was handed no PDF. */
  readonly calls: (Buffer | ParserInput)[] = []

  async parse(input: Buffer | ParserInput = {}): Promise<ParsedResume> {
    this.calls.push(input)

    const fixture = readJsonFixture<{ parsed: ParsedResume }>('checks', 'parse-fidelity-1.json')
    return fixture.parsed
  }
}
