import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { runMatchRating } from '@/lib/checks/match-rating'
import type { MatchRatingDetail } from '@/lib/checks/types'
import { FakeLlmProvider } from '@/lib/llm'
import { parseResumeContent } from '@/lib/resume/schema'

const content = parseResumeContent(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
  ),
)

const version = { content, templateId: 'default' }

const job = {
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  jdText: 'Own the charge path. Go, Kafka, ledgers. gRPC a plus.',
}

function llmRating(tier: string) {
  return new FakeLlmProvider({
    responder: () =>
      JSON.stringify({
        tier,
        reasons: [
          { text: 'Owns a payments ledger end to end', citations: ['experience[0].bullets[0]'] },
          { text: 'No gRPC anywhere in the résumé', citations: [], gap: true },
        ],
      }),
  })
}

describe('runMatchRating', () => {
  it('maps a strong tier to pass, with the tier word and reason count in the summary', async () => {
    const outcome = await runMatchRating({ version, job, llm: llmRating('strong') })

    expect(outcome.kind).toBe('match_rating')
    expect(outcome.verdict).toBe('pass')
    expect(outcome.summary).toBe('Strong — 2 reasons')

    const details = outcome.details as MatchRatingDetail
    expect(details.tier).toBe('strong')
    expect(details.reasons[0].citations).toEqual(['experience[0].bullets[0]'])
    expect(details.reasons[1].gap).toBe(true)
  })

  it('maps possible to warn', async () => {
    const outcome = await runMatchRating({ version, job, llm: llmRating('possible') })
    expect(outcome.verdict).toBe('warn')
    expect(outcome.summary).toBe('Possible — 2 reasons')
  })

  it('maps reach to warn, never fail — a reach is a legitimate application', async () => {
    const outcome = await runMatchRating({ version, job, llm: llmRating('reach') })
    expect(outcome.verdict).toBe('warn')
    expect(outcome.summary).toBe('Reach — 2 reasons')
  })

  it('carries no numeric field anywhere in the payload', async () => {
    const outcome = await runMatchRating({ version, job, llm: llmRating('strong') })
    expect(JSON.stringify(outcome)).not.toMatch(/"(score|percentage|percent|grade)"\s*:/i)
  })

  it('turns a missing model into a warn outcome carrying the degraded message', async () => {
    const outcome = await runMatchRating({ version, job, llm: null })

    expect(outcome.verdict).toBe('warn')
    expect(outcome.error).toMatch(/key in Settings/)
    expect(outcome.details).toBeNull()
  })

  it('reports rather than crashes when there is no job to rate against', async () => {
    const outcome = await runMatchRating({ version, llm: llmRating('strong') })

    expect(outcome.verdict).toBe('warn')
    expect(outcome.error).toBeTruthy()
  })

  it('turns an unusable model response into a warn outcome, not a throw', async () => {
    const bad = new FakeLlmProvider({ responder: () => 'not json at all' })
    const outcome = await runMatchRating({ version, job, llm: bad })

    expect(outcome.verdict).toBe('warn')
    expect(outcome.error).toBeTruthy()
    expect(outcome.details).toBeNull()
  })
})
