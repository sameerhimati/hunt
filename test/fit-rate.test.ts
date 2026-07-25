import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FitResponseError, FitUnavailableError, rateFit } from '@/lib/fit/rate'
import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import { parseResumeContent } from '@/lib/resume/schema'
import type { LlmRequest } from '@/lib/llm/types'

const content = parseResumeContent(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
  ),
)

const job = {
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  jdText: 'Own the charge path. Go, Kafka, ledgers. gRPC a plus.',
}

function llmReturning(payload: unknown) {
  return new FakeLlmProvider({ responder: () => JSON.stringify(payload) })
}

describe('rateFit', () => {
  it('returns a tier with reasons traced back to the résumé', async () => {
    const rating = await rateFit({
      content,
      job,
      llm: llmReturning({
        tier: 'strong',
        reasons: [
          { text: 'Owns a payments ledger', citations: ['experience[0].bullets[0]'] },
          { text: 'No gRPC anywhere in the résumé', citations: [], gap: true },
        ],
      }),
    })

    expect(rating.tier).toBe('strong')
    expect(rating.reasons[0].citations).toEqual(['experience[0].bullets[0]'])
    expect(rating.reasons[1].gap).toBe(true)
  })

  it('cannot carry a number, whatever the model returns', async () => {
    const rating = await rateFit({
      content,
      job,
      llm: llmReturning({
        tier: 'possible',
        score: 78,
        reasons: [{ text: 'Adjacent platform work', citations: [], confidence: 0.8 }],
      }),
    })

    expect(JSON.stringify(rating)).not.toMatch(/"(score|percent|percentage|grade|confidence)"\s*:/i)
  })

  it('drops a citation that points nowhere but keeps the reason', async () => {
    const rating = await rateFit({
      content,
      job,
      llm: llmReturning({
        tier: 'possible',
        reasons: [
          {
            text: 'Kafka experience matches the event bus work',
            citations: ['experience[0].bullets[2]', 'experience[9].bullets[0]'],
          },
        ],
      }),
    })

    // The fabricated path is gone; the real one — and the reason — survive.
    expect(rating.reasons[0].citations).toEqual(['experience[0].bullets[2]'])
  })

  it('refuses a tier outside the vocabulary instead of rounding it', async () => {
    await expect(
      rateFit({ content, job, llm: llmReturning({ tier: '87%', reasons: [] }) }),
    ).rejects.toBeInstanceOf(FitResponseError)
  })

  it('refuses a verdict the user cannot check', async () => {
    await expect(
      rateFit({ content, job, llm: llmReturning({ tier: 'reach', reasons: [] }) }),
    ).rejects.toBeInstanceOf(FitResponseError)
  })

  it('names the missing key rather than crashing when no model is configured', async () => {
    await expect(rateFit({ content, job, llm: null })).rejects.toBeInstanceOf(FitUnavailableError)
  })

  it('tags the request `kind:rate` so the scripted fake can dispatch it', async () => {
    let seen: LlmRequest | null = null
    const llm = new FakeLlmProvider({
      responder: (request) => {
        seen = request
        return JSON.stringify({ tier: 'reach', reasons: [{ text: 'Different stack', gap: true }] })
      },
    })

    await rateFit({ content, job, llm })
    expect(promptKindOf(seen!)).toBe('rate')
  })
})
