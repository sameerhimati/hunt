import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditAiTell, runAiTell } from '@/lib/checks/ai-tell'
import type { AiTellDetail } from '@/lib/checks/types'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'

const clean = parseResumeContent(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
  ),
)

/** A copy of the clean fixture with one bullet swapped for the phrase under test. */
function withBullet(text: string): ResumeContent {
  const content = structuredClone(clean)
  content.experience[0].bullets = [text]
  return content
}

describe('auditAiTell', () => {
  it('returns nothing for a résumé written in plain words', () => {
    expect(auditAiTell(clean)).toEqual([])
  })

  it.each([
    ['Leveraged Kafka to move six services off REST polling', 'Leveraged'],
    ['Utilized Redis to cache the balance-read path', 'Utilized'],
    ['Spearheaded the ledger rewrite across three processors', 'Spearheaded'],
    ['Passionate about distributed systems and payments', 'Passionate about'],
    ['Shipped a cutting-edge event bus for the ledger', 'cutting-edge'],
    ['Seamlessly integrated three card processors', 'Seamlessly'],
    ['Responsible for the transactions sync pipeline', 'Responsible for'],
    ['A proven track record of shipping payments infrastructure', 'proven track record'],
    ['A results-driven engineer on the platform team', 'results-driven'],
    ['A team player across backend and infrastructure', 'team player'],
    ["In today's fast-paced fintech landscape, owned the ledger", "In today's fast-paced"],
  ])('flags %j', (bullet, phrase) => {
    const flags = auditAiTell(withBullet(bullet))

    expect(flags).toHaveLength(1)
    expect(flags[0].phrase).toBe(phrase)
    expect(flags[0].path).toBe('experience[0].bullets[0]')
    expect(flags[0].suggestion.trim()).not.toBe('')
  })

  it('offers the shorter word as the rewrite', () => {
    const [flag] = auditAiTell(withBullet('Utilized Redis to cache the balance-read path'))
    expect(flag.suggestion).toContain('used')
  })

  it('flags a stack of three adverbs in one sentence', () => {
    const [flag] = auditAiTell(
      withBullet('Rapidly and efficiently delivered services that scaled effortlessly.'),
    )

    expect(flag.path).toBe('experience[0].bullets[0]')
    expect(flag.suggestion).toContain('Three adverbs')
  })

  it('does not count "weekly" and friends as an adverb stack', () => {
    expect(
      auditAiTell(withBullet('Ran the weekly design review and the daily on-call handoff')),
    ).toEqual([])
  })

  it('reads the whole document, not just experience bullets', () => {
    const content = structuredClone(clean)
    content.basics.summary = 'Results-driven backend engineer passionate about payments.'
    content.projects[0].bullets = ['Utilized Postgres for double-entry bookkeeping']

    const paths = auditAiTell(content).map((flag) => flag.path)
    expect(paths).toContain('basics.summary')
    expect(paths).toContain('projects[0].bullets[0]')
  })

  it('matches regardless of case and does not leak regex state between runs', () => {
    const content = withBullet('LEVERAGED Kafka and leveraged Redis')

    expect(auditAiTell(content)).toHaveLength(2)
    // Same input twice: global regexes must not carry lastIndex across calls.
    expect(auditAiTell(content)).toHaveLength(2)
  })

  it('does not flag words that merely contain a pattern', () => {
    expect(auditAiTell(withBullet('Built a team-playerless leverager? No: shipped the ledger'))).toEqual(
      [],
    )
  })
})

describe('runAiTell', () => {
  it('reports clean without any LLM configured', async () => {
    const outcome = await runAiTell({ version: { content: clean }, llm: null })

    expect(outcome.kind).toBe('ai_tell')
    expect(outcome.verdict).toBe('pass')
    expect(outcome.summary).toBe('clean')
    expect(outcome.error).toBeUndefined()
    expect((outcome.details as AiTellDetail).flags).toEqual([])
  })

  it('counts one phrase in the singular', async () => {
    const outcome = await runAiTell({
      version: { content: withBullet('Leveraged Kafka to remove 200k calls per day') },
    })

    expect(outcome.summary).toBe('1 phrase flagged')
    expect(outcome.verdict).toBe('warn')
    expect((outcome.details as AiTellDetail).flags).toHaveLength(1)
  })

  it('counts several phrases in the plural and never fails the document', async () => {
    const content = structuredClone(clean)
    content.basics.summary = 'Results-driven team player who utilized cutting-edge tooling.'

    const outcome = await runAiTell({ version: { content } })

    expect(outcome.summary).toMatch(/^\d+ phrases flagged$/)
    expect(outcome.verdict).toBe('warn')
  })

  it('carries no aggregate score of any kind', async () => {
    const outcome = await runAiTell({ version: { content: clean } })

    expect(outcome).not.toHaveProperty('score')
    expect(outcome).not.toHaveProperty('total')
    expect(outcome).not.toHaveProperty('percentage')
  })
})
