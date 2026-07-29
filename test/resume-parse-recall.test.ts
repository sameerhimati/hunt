import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { readPdf } from '@/lib/resume/parse/blocks'
import { structureResume } from '@/lib/resume/parse/structure'

/**
 * How good is the keyless parser, measured the way the model is measured?
 *
 * `gates/unit/phase-1/import-roundtrip.gate.test.ts` holds the LLM import path
 * to ≥95% recall against `expected-{1,2,3}.json`, counting leaf fields. This
 * runs the real `readPdf` → `structureResume` pipeline against the *same*
 * labels with the *same* counting method, so the two numbers are directly
 * comparable and nobody has to take "the free path is good enough" on faith.
 *
 * The structurer's own suite tests it on recorded `SourceDocument` literals,
 * which is the right shape for a unit test but cannot catch the readers and the
 * structurer disagreeing. This is the test that does — and the accuracy claim
 * lives here rather than in a commit message, where it would quietly rot.
 *
 * **What these three fixtures are and are not.** They vary usefully in layout —
 * right-aligned dates, a left date rail, a sidebar with sections out of order —
 * but they were all produced by hunt's own LaTeX templates, so their typography
 * is consistent and their text layer is clean. That makes them a fair test of
 * the layout heuristics and an *optimistic* one for the messy real world: a
 * Word or Canva résumé will have noisier fonts and worse spacing. So the bar
 * here is exact equality, not 95% — on a corpus this clean, anything less is a
 * regression worth seeing immediately. When a genuinely messy real-world
 * fixture is added, it belongs under the gate's ≥95% bar rather than this one.
 */

const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures/resume')

/** Same flattening as the Phase 1 gate, so the recall numbers mean the same thing. */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [key, child] of flatten(item, `${prefix}[${index}]`)) out.set(key, child)
    })
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('_')) continue
      for (const [leaf, text] of flatten(child, prefix ? `${prefix}.${key}` : key)) {
        out.set(leaf, text)
      }
    }
  } else if (value != null && value !== '') {
    out.set(prefix, String(value))
  }
  return out
}

/** Mirrors `scoreConfidence()`'s normalisation in `src/lib/resume/import.ts`. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const DATE_KEYS = new Set(['start', 'end'])

describe('keyless PDF parsing, scored against the same labels as the model', () => {
  for (const n of [1, 2, 3]) {
    it(`sample-${n}.pdf — recovers every hand-labelled field`, async () => {
      const doc = await readPdf(fs.readFileSync(path.join(FIXTURES, `sample-${n}.pdf`)))
      const expected = JSON.parse(
        fs.readFileSync(path.join(FIXTURES, `expected-${n}.json`), 'utf8'),
      )

      const want = flatten(expected)
      const got = flatten(structureResume(doc))

      const missed: string[] = []
      let hits = 0
      for (const [key, value] of want) {
        if (got.get(key) === value) hits += 1
        else missed.push(`${key}: want ${JSON.stringify(value)}, got ${JSON.stringify(got.get(key))}`)
      }

      expect(hits, `recovered ${hits}/${want.size} fields\n  ${missed.join('\n  ')}`).toBe(
        want.size,
      )
    })

    it(`sample-${n}.pdf — every field is verbatim, so nothing was authored`, async () => {
      const doc = await readPdf(fs.readFileSync(path.join(FIXTURES, `sample-${n}.pdf`)))
      const haystack = normalise(doc.text)

      // The point of the keyless path: a regex cannot fabricate a job title, so
      // `scoreConfidence()` should find every field verbatim and the review
      // screen should read "every field matched the PDF". Dates are the one
      // legitimate reformatting, and that function already tolerates them.
      const invented: string[] = []
      for (const [key, value] of flatten(structureResume(doc))) {
        const leaf = key.split('.').pop()!.replace(/\[\d+\]$/, '')
        if (DATE_KEYS.has(leaf)) continue
        if (!haystack.includes(normalise(value))) invented.push(`${key}: ${JSON.stringify(value)}`)
      }

      expect(invented, `not found verbatim in the document:\n  ${invented.join('\n  ')}`).toEqual([])
    })
  }
})
