import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseFidelity, runParseFidelity } from '@/lib/checks/parse-fidelity'
import { isRenderlessParser, resolveResumeParser } from '@/lib/checks/parser-adapter'
import { FakeResumeParser } from '@/lib/checks/parsers/fake'
import { HeuristicResumeParser, parseResumeText } from '@/lib/checks/parsers/heuristic'
import type { ParsedResume, ResumeParser } from '@/lib/checks/types'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'

/**
 * Parse fidelity is the check that measures the machine, so the tests are about
 * two things: that the comparison names exactly what was lost (a "fields
 * dropped" count nobody can verify is the same sin as an ATS score), and that
 * the runner never renders a PDF it doesn't need — the gate's checks run would
 * otherwise sit on a LaTeX compile.
 */

const fixture = <T>(...segments: string[]): T =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'gates', 'fixtures', ...segments), 'utf8'))

const alexChen = parseResumeContent(fixture('resume', 'alex-chen.json'))
const degraded = fixture<{ parsed: ParsedResume }>('checks', 'parse-fidelity-1.json').parsed

const version = { id: 'v1', content: alexChen, templateId: 'jakes' }

afterEach(() => {
  delete process.env.HUNT_TEST_MODE
})

describe('parseFidelity', () => {
  it('reports nothing dropped when the parser returned the document intact', () => {
    const result = parseFidelity({ content: alexChen, parsed: alexChen })

    expect(result.dropped).toEqual([])
    expect(result.verdict).toBe('pass')
    expect(result.checked).toBeGreaterThan(20)
  })

  it('names the lost fields in stable path form and calls it a warn', () => {
    const result = parseFidelity({ content: alexChen, parsed: degraded })

    expect(result.dropped).toEqual(['basics.url', 'experience[1].start'])
    expect(result.verdict).toBe('warn')
  })

  it('counts an altered field as dropped — a truncated bullet is not a survival', () => {
    const parsed = structuredClone(alexChen) as ParsedResume
    parsed.experience![0].bullets![1] = 'Designed idempotent retry semantics for webhook'

    const result = parseFidelity({ content: alexChen, parsed })

    expect(result.dropped).toEqual(['experience[0].bullets[1]'])
  })

  it('ignores typesetting noise — whitespace and dash variants are not losses', () => {
    const parsed = structuredClone(alexChen) as ParsedResume
    parsed.basics!.summary = alexChen.basics.summary!.replace(/ /g, '  ').replace('-', '–')

    expect(parseFidelity({ content: alexChen, parsed }).dropped).toEqual([])
  })

  it('fails on structural loss — a whole role the ATS never saw', () => {
    const parsed = structuredClone(alexChen) as ParsedResume
    parsed.experience = [alexChen.experience[0]]

    const result = parseFidelity({ content: alexChen, parsed })

    expect(result.dropped).toContain('experience[1].company')
    expect(result.verdict).toBe('fail')
  })

  it('fails when a fifth of the fields are gone even without structural loss', () => {
    const parsed = structuredClone(alexChen) as ParsedResume
    parsed.skills = parsed.skills!.map((group) => ({ ...group, items: [] }))

    expect(parseFidelity({ content: alexChen, parsed }).verdict).toBe('fail')
  })

  it('does not count fields the user never filled in', () => {
    const sparse = parseResumeContent({ basics: { name: 'Alex Chen', email: 'a@example.com' } })

    expect(parseFidelity({ content: sparse, parsed: sparse }).checked).toBe(2)
  })
})

describe('the parser adapter', () => {
  it('resolves the fixture twin in test mode and the heuristic parser otherwise', async () => {
    process.env.HUNT_TEST_MODE = '1'
    expect((await resolveResumeParser()).id).toBe('fake-parser')

    delete process.env.HUNT_TEST_MODE
    expect((await resolveResumeParser()).id).toBe('heuristic-text-layer')
  })

  it('declares whether it needs a render — the fake does not, the heuristic does', () => {
    expect(isRenderlessParser(new FakeResumeParser())).toBe(true)
    expect(isRenderlessParser(new HeuristicResumeParser())).toBe(false)
  })

  it('returns the committed degradations: the GitHub URL and the Plaid start date', async () => {
    const parsed = await new FakeResumeParser().parse({})

    expect(parsed.basics?.url).toBeNull()
    expect(parsed.experience?.[1].start).toBeNull()
  })
})

describe('runParseFidelity', () => {
  it('reads the fake parser without ever rendering a PDF', async () => {
    const parser = new FakeResumeParser()

    const outcome = await runParseFidelity({ version, parser })

    expect(parser.calls).toHaveLength(1)
    expect(parser.calls[0]).not.toBeInstanceOf(Buffer)
    expect(outcome.kind).toBe('parse_fidelity')
    expect(outcome.verdict).toBe('warn')
    expect(outcome.summary).toMatch(/^2 of \d+ fields dropped$/)
    expect(outcome.error).toBeUndefined()
    expect((outcome.details as { dropped: string[] }).dropped).toEqual([
      'basics.url',
      'experience[1].start',
    ])
  })

  it('carries no aggregate — no score, no total, no percentage', async () => {
    const outcome = await runParseFidelity({ version, parser: new FakeResumeParser() })

    expect(JSON.stringify(outcome)).not.toMatch(/score|total|percent/i)
  })

  it('says it did not measure when the parser throws, rather than passing quietly', async () => {
    const broken: ResumeParser = {
      id: 'broken',
      parse: async () => {
        throw new Error('That PDF has no text layer.')
      },
    }
    // Declares no `requiresRender`, so it would render — head that off by
    // pretending it needs none, keeping the test off Tectonic.
    const parser = { ...broken, requiresRender: false }

    const outcome = await runParseFidelity({ version, parser })

    expect(outcome.verdict).toBe('warn')
    expect(outcome.summary).toBe('Not measured')
    expect(outcome.error).toBe('That PDF has no text layer.')
  })
})

describe('the heuristic parser (text layer in, résumé out)', () => {
  // What Jake's template leaves in the PDF text layer: small-capped headings,
  // a middot contact line, two-column entry rows and human dates.
  const TEXT = [
    'ALEX CHEN',
    'Backend Engineer',
    'alex.chen@example.com · +1 (415) 555-0132 · San Francisco, CA · github.com/alexchen-dev',
    'Summary',
    'Backend engineer with six years building payment and platform infrastructure in Go and TypeScript.',
    'Experience',
    'Ramp    Mar 2023 – Present',
    'Senior Backend Engineer    San Francisco, CA',
    '• Own the ledger service that settles $40M/month in card transactions',
    '• Reduced p99 from 210ms to 130ms after sharding the balance-read path',
    'Projects',
    'ledgerline — Open-source double-entry ledger library for Postgres',
    'https://github.com/alexchen-dev/ledgerline',
    '• 1.8k GitHub stars; used in production by three fintech startups',
    'Education',
    'University of Washington    2014 – 2018',
    'B.S. Computer Science',
    'Skills',
    'Languages: Go, TypeScript, Python, SQL',
    'AWARDS',
    '• Ramp engineering award, 2024',
  ].join('\n')

  /** The document that text was typeset from — the round trip's other end. */
  const SOURCE = parseResumeContent({
    basics: {
      name: 'Alex Chen',
      label: 'Backend Engineer',
      email: 'alex.chen@example.com',
      phone: '+1 (415) 555-0132',
      url: 'github.com/alexchen-dev',
      location: 'San Francisco, CA',
      summary:
        'Backend engineer with six years building payment and platform infrastructure in Go and TypeScript.',
    },
    experience: [
      {
        company: 'Ramp',
        title: 'Senior Backend Engineer',
        location: 'San Francisco, CA',
        start: '2023-03',
        bullets: [
          'Own the ledger service that settles $40M/month in card transactions',
          'Reduced p99 from 210ms to 130ms after sharding the balance-read path',
        ],
      },
    ],
    education: [
      {
        institution: 'University of Washington',
        degree: 'B.S. Computer Science',
        start: '2014',
        end: '2018',
      },
    ],
    skills: [{ category: 'Languages', items: ['Go', 'TypeScript', 'Python', 'SQL'] }],
    projects: [
      {
        name: 'ledgerline',
        description: 'Open-source double-entry ledger library for Postgres',
        url: 'https://github.com/alexchen-dev/ledgerline',
        bullets: ['1.8k GitHub stars; used in production by three fintech startups'],
      },
    ],
    custom: [{ title: 'AWARDS', bullets: ['Ramp engineering award, 2024'] }],
  })

  const parsed = parseResumeText(TEXT)

  it('pulls the contacts out of the header line', () => {
    expect(parsed.basics?.name).toBe('ALEX CHEN')
    expect(parsed.basics?.label).toBe('Backend Engineer')
    expect(parsed.basics?.email).toBe('alex.chen@example.com')
    expect(parsed.basics?.phone).toBe('+1 (415) 555-0132')
    expect(parsed.basics?.location).toBe('San Francisco, CA')
    expect(parsed.basics?.url).toBe('github.com/alexchen-dev')
    expect(parsed.basics?.summary).toContain('six years building payment')
  })

  it('rebuilds an experience entry, splitting the gutter and the date range', () => {
    expect(parsed.experience).toHaveLength(1)
    expect(parsed.experience?.[0]).toMatchObject({
      company: 'Ramp',
      title: 'Senior Backend Engineer',
      location: 'San Francisco, CA',
      start: '2023-03',
    })
    // "Present" is an open end, not a date the ATS read.
    expect(parsed.experience?.[0].end).toBeUndefined()
    expect(parsed.experience?.[0].bullets).toHaveLength(2)
  })

  it('rebuilds education, skills, projects and an unknown section', () => {
    expect(parsed.education?.[0]).toMatchObject({
      institution: 'University of Washington',
      degree: 'B.S. Computer Science',
      start: '2014',
      end: '2018',
    })
    expect(parsed.skills?.[0]).toMatchObject({
      category: 'Languages',
      items: ['Go', 'TypeScript', 'Python', 'SQL'],
    })
    expect(parsed.projects?.[0]).toMatchObject({
      name: 'ledgerline',
      description: 'Open-source double-entry ledger library for Postgres',
      url: 'https://github.com/alexchen-dev/ledgerline',
    })
    expect(parsed.custom?.[0]?.title).toBe('AWARDS')
  })

  it('round-trips a single-column résumé with nothing dropped', () => {
    // The same document the text above was typeset from. A clean single-column
    // layout is the case where a naive parser and the user agree — and `pass`
    // has to be reachable, or the check is just pessimism.
    const result = parseFidelity({ content: SOURCE, parsed })

    expect(result.dropped).toEqual([])
    expect(result.verdict).toBe('pass')
  })

  it('reports a lost section as structural loss when the heading did not survive', () => {
    const headless = parseResumeText(TEXT.replace('Experience\n', ''))

    const result = parseFidelity({ content: SOURCE, parsed: headless })

    expect(headless.experience).toEqual([])
    expect(result.dropped).toContain('experience[0].company')
    expect(result.verdict).toBe('fail')
  })

  it('refuses to guess when handed no document at all', async () => {
    await expect(new HeuristicResumeParser().parse({})).rejects.toThrow(/no document/i)
  })
})

/**
 * The real round trip — render with Tectonic, parse the PDF text layer, compare.
 * Opt-in (`HUNT_RENDER_TESTS=1`) because a cold Tectonic downloads a TeX
 * toolchain; `pnpm verify` must stay fast.
 */
describe.skipIf(!process.env.HUNT_RENDER_TESTS)('render → re-parse → compare, for real', () => {
  it('loses only what the two-column entry row genuinely merges', async () => {
    const outcome = await runParseFidelity({ version })

    // Jake's `\entry` puts title and city on one tabularx line and the text
    // layer keeps no gutter, so those four come back glued. See the note in
    // parsers/heuristic.ts — this is the real reading, not a tolerance.
    expect(outcome.error).toBeUndefined()
    expect((outcome.details as { dropped: string[] }).dropped).toEqual([
      'experience[0].title',
      'experience[0].location',
      'experience[1].title',
      'experience[1].location',
    ])
    expect(outcome.verdict).toBe('warn')
  }, 300_000)
})

// Type-level guard: the loose parsed shape must still accept real content.
const _content: ParsedResume = alexChen satisfies ResumeContent
void _content
