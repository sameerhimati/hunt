import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { extractJdTerms } from '@/lib/checks/jd-terms'
import { runKeywordCoverage, scoreCoverage } from '@/lib/checks/keyword-coverage'
import type { KeywordCoverageDetail } from '@/lib/checks/types'
import { parseResumeContent } from '@/lib/resume/schema'

const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures')

const content = parseResumeContent(
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8')),
)

interface LabeledFixture {
  jdTerms: string[]
  expectedMatched: string[]
  expectedMissing: string[]
}

const labeled = (name: string): LabeledFixture =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'checks', `${name}.json`), 'utf8'))

/**
 * The hand labels are the specification. They were read off the résumé by a
 * human before this scorer existed, so when the two disagree the scorer is
 * wrong — never the file.
 */
describe.each(['keyword-coverage-1', 'keyword-coverage-2', 'keyword-coverage-3'])(
  'scoreCoverage vs %s',
  (name) => {
    const fixture = labeled(name)

    it('reproduces the hand labels exactly', () => {
      const { matched, missing } = scoreCoverage(fixture.jdTerms, content)

      expect([...matched].sort()).toEqual([...fixture.expectedMatched].sort())
      expect([...missing].sort()).toEqual([...fixture.expectedMissing].sort())
    })

    it('classifies every term exactly once and echoes the input casing', () => {
      const { matched, missing } = scoreCoverage(fixture.jdTerms, content)

      expect([...matched, ...missing].sort()).toEqual([...fixture.jdTerms].sort())
    })
  },
)

describe('scoreCoverage matching rule', () => {
  const score = (terms: string[]) => scoreCoverage(terms, content)

  it('treats hyphen and space as the same separator', () => {
    expect(score(['on-call', 'on call', 'bank-linking', 'bank linking']).missing).toEqual([])
  })

  it('matches singular and plural in both directions, and nothing else morphological', () => {
    expect(score(['processor', 'processors', 'webhook', 'webhooks']).missing).toEqual([])
    // "idempotent" is on the résumé; "idempotency" is a different word.
    expect(score(['idempotency', 'idempotence']).matched).toEqual([])
  })

  it('refuses substring matches', () => {
    // "Kube" lives only inside "Kubernetes"; "edge" only inside "ledger".
    expect(score(['Kube', 'edge', 'grade']).matched).toEqual([])
  })

  it('refuses to assemble a phrase out of words that never sit together', () => {
    // "payment" and "orchestration" both appear — in different fields.
    expect(score(['payment orchestration']).missing).toEqual(['payment orchestration'])
    expect(score(['payment', 'orchestration']).missing).toEqual([])
  })

  it('never spans a field boundary', () => {
    // skills[1].items are "Kafka", "Postgres", … — adjacent, but separate fields.
    expect(score(['Kafka Postgres']).matched).toEqual([])
  })

  it('infers no synonyms — the property the check exists for', () => {
    expect(score(['latency', 'monitoring', 'uptime', 'message broker', 'Golang']).matched).toEqual(
      [],
    )
  })

  it('reports an unmatchable term as missing rather than throwing', () => {
    expect(score(['', '   ', '—']).missing).toHaveLength(3)
  })
})

describe('extractJdTerms', () => {
  const jd = [
    'Senior Backend Engineer — Payments',
    '',
    'Requirements:',
    '- 5+ years of experience with Go and distributed systems',
    '- You have shipped services on Kubernetes and know Postgres well',
    '- Familiarity with gRPC, Kafka and CI/CD pipelines',
    '- On-call rotation; you care about SLOs and incident response',
  ].join('\n')

  it('is deterministic', () => {
    expect(extractJdTerms(jd)).toEqual(extractJdTerms(jd))
  })

  it('picks up tech tokens, acronyms and known multi-word skills, order preserved', () => {
    const terms = extractJdTerms(jd)

    expect(terms).toContain('Go')
    expect(terms).toContain('Kubernetes')
    expect(terms).toContain('Postgres')
    expect(terms).toContain('gRPC')
    expect(terms).toContain('CI/CD')
    expect(terms).toContain('distributed systems')
    expect(terms).toContain('incident response')
    expect(terms.indexOf('Go')).toBeLessThan(terms.indexOf('Kubernetes'))
  })

  it('drops stopwords and dedupes case-insensitively', () => {
    const terms = extractJdTerms('Kafka matters. We use KAFKA. You and the team ship with kafka.')

    expect(terms).toEqual(['Kafka'])
  })

  it('returns nothing for a posting with no terms in it', () => {
    expect(extractJdTerms('we are a team that works with the best of them')).toEqual([])
  })
})

describe('runKeywordCoverage', () => {
  const version = { content }

  it('reports the count as N / M JD terms, never a percentage', async () => {
    const outcome = await runKeywordCoverage({
      version,
      job: {
        title: 'Senior Backend Engineer',
        company: 'Stripe',
        jdText: 'Experience with Go, Kafka and Postgres. gRPC and Ruby are a plus.',
      },
    })

    const details = outcome.details as KeywordCoverageDetail
    expect(outcome.kind).toBe('keyword_coverage')
    expect(outcome.summary).toBe(`${details.matched.length} / ${details.terms.length} JD terms`)
    expect(outcome.summary).not.toMatch(/%/)
    expect(details.matched).toEqual(expect.arrayContaining(['Go', 'Kafka', 'Postgres']))
    expect(details.missing).toEqual(expect.arrayContaining(['gRPC', 'Ruby']))
    expect(details.matched.length + details.missing.length).toBe(details.terms.length)
    expect(outcome.verdict).toBe('warn')
  })

  it('carries no aggregate score of any kind in its payload', async () => {
    const outcome = await runKeywordCoverage({
      version,
      job: { title: 'Backend Engineer', company: 'Ramp', jdText: 'Go, Kafka, Postgres.' },
    })

    expect(JSON.stringify(outcome)).not.toMatch(/score|percent|rating|grade/i)
    expect(outcome.verdict).toBe('pass')
  })

  it('says it did not measure instead of inventing a pass when there is no JD', async () => {
    const outcome = await runKeywordCoverage({ version, job: null })

    expect(outcome.summary).toBe('Not measured')
    expect(outcome.verdict).toBe('warn')
    expect(outcome.error).toMatch(/job description/i)
    expect((outcome.details as KeywordCoverageDetail).terms).toEqual([])
  })

  it('says the same when the JD yields no terms at all', async () => {
    const outcome = await runKeywordCoverage({
      version,
      job: { title: 'Engineer', company: 'Acme', jdText: 'we work with the best of them' },
    })

    expect(outcome.summary).toBe('Not measured')
    expect(outcome.error).toMatch(/no terms/i)
  })
})
