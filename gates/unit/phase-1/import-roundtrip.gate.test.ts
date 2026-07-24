import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 1 exit gate — PDF import round-trips ≥95% of fields on 3 sample résumés.
//
// VERIFIER GAP (P1's first task): the sample PDFs, their hand-labeled expected
// JSON, and the recorded parse responses do not exist yet — recording them is
// the first task of Phase 1 (use public sample résumés, NEVER the real one).
// Until then this gate is RED on the missing fixtures, which is correct.
import { importResumePdf } from '@/lib/resume/import'
import { FakeLlmProvider } from '@/lib/llm'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')

/** Flattens to leaf path→value pairs so field recall is countable. */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      for (const [k, v] of flatten(item, `${prefix}[${i}]`)) out.set(k, v)
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('_')) continue
      for (const [k, v] of flatten(child, prefix ? `${prefix}.${key}` : key)) out.set(k, v)
    }
  } else if (value != null && value !== '') {
    out.set(prefix, String(value))
  }
  return out
}

describe('PDF import round-trip (the ≥95% recall bar from PLAN.md)', () => {
  for (const n of [1, 2, 3]) {
    it(`recovers ≥95% of hand-labeled fields from sample-${n}.pdf`, async () => {
      const pdf = fs.readFileSync(path.join(FIXTURES, `resume/sample-${n}.pdf`))
      const expected = JSON.parse(
        fs.readFileSync(path.join(FIXTURES, `resume/expected-${n}.json`), 'utf8'),
      )
      // Recorded real-model output replayed through the fake — the gate measures
      // the extraction pipeline (text extraction, prompting, field mapping),
      // deterministically, without a key.
      const recorded = fs.readFileSync(
        path.join(FIXTURES, `resume/parse-response-${n}.txt`),
        'utf8',
      )

      const { content, fieldConfidence } = await importResumePdf(
        pdf,
        new FakeLlmProvider({ reply: recorded }),
      )

      const want = flatten(expected)
      const got = flatten(content)
      let hits = 0
      for (const [k, v] of want) if (got.get(k) === v) hits++

      const recall = hits / want.size
      expect(recall, `recovered ${hits}/${want.size} fields`).toBeGreaterThanOrEqual(0.95)

      // The review screen needs per-field confidence to flag amber fields.
      expect(Object.keys(fieldConfidence).length).toBeGreaterThan(0)
    })
  }
})
