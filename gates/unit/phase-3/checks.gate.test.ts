import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 3 exit gate — the honest checks. Each is named for what it measures
// and reports concrete counts; there is NO aggregate score anywhere.
// RED until src/lib/checks/* exist.
import { CHECK_KINDS } from '@/lib/checks'
import { scoreCoverage } from '@/lib/checks/keyword-coverage'
import { lintFormat } from '@/lib/checks/format-lint'
import { parseFidelity } from '@/lib/checks/parse-fidelity'
import { parseResumeContent } from '@/lib/resume/schema'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))
const labeled = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'checks/keyword-coverage-1.json'), 'utf8'),
)

describe('check registry', () => {
  it('is exactly the five honest kinds — no aggregate', () => {
    expect([...CHECK_KINDS].sort()).toEqual(
      ['ai_tell', 'format_lint', 'keyword_coverage', 'match_rating', 'parse_fidelity'].sort(),
    )
  })
})

describe('keyword coverage (deterministic scorer vs hand-labeled fixture)', () => {
  it('matches the human labels exactly', () => {
    const content = parseResumeContent(alexChen)
    const { matched, missing } = scoreCoverage(labeled.jdTerms, content)
    expect([...matched].sort()).toEqual([...labeled.expectedMatched].sort())
    expect([...missing].sort()).toEqual([...labeled.expectedMissing].sort())
  })
})

describe('format lint (objective rules only)', () => {
  it('flags a rigged résumé with the expected issue codes', () => {
    const rigged = structuredClone(parseResumeContent(alexChen))
    rigged.experience[0].bullets.push(
      'I personally architected, designed, implemented, deployed, monitored, and maintained an extremely large number of microservices across a wide variety of business domains while collaborating cross-functionally with many stakeholders to deliver value at scale over a sustained period of time.',
    )
    rigged.experience[1].start = 'June 2020' // clashes with 2023-03 style elsewhere

    const codes = lintFormat(rigged).map((issue: { code: string }) => issue.code)
    expect(codes).toContain('bullet-too-long')
    expect(codes).toContain('date-format-mixed')
    expect(codes).toContain('first-person')
  })

  it('reports the clean fixture clean', () => {
    expect(lintFormat(parseResumeContent(alexChen))).toEqual([])
  })
})

describe('parse fidelity (render → re-parse → compare)', () => {
  it('names the dropped fields and maps verdicts honestly', () => {
    const content = parseResumeContent(alexChen)

    // A rigged re-parse that lost the GitHub URL and merged the Plaid dates.
    const parsed = structuredClone(content)
    parsed.basics.url = null
    parsed.experience[1].start = null

    const result = parseFidelity({ content, parsed })
    expect(result.dropped).toContain('basics.url')
    expect(result.dropped).toContain('experience[1].start')
    expect(result.verdict).not.toBe('pass')

    const clean = parseFidelity({ content, parsed: content })
    expect(clean.dropped).toEqual([])
    expect(clean.verdict).toBe('pass')
  })
})
