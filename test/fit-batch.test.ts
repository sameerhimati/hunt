import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { JobListing } from '@/lib/adapters/jobs/types'
import { BATCH_SIZE, rateFitBatch } from '@/lib/fit/batch'
import { FitUnavailableError } from '@/lib/fit/rate'
import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import type { LlmRequest } from '@/lib/llm/types'
import { parseResumeContent } from '@/lib/resume/schema'

const content = parseResumeContent(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
  ),
)

const listing = (overrides: Partial<JobListing> & { externalId: string }): JobListing => ({
  title: 'Senior Backend Engineer',
  company: 'Northwind Robotics',
  url: `https://jobs.example.com/${overrides.externalId}`,
  source: 'fake-jobs',
  ...overrides,
})

function llmReturning(payload: unknown) {
  return new FakeLlmProvider({
    responder: () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  })
}

afterEach(() => {
  delete process.env.HUNT_TEST_MODE
})

describe('rateFitBatch', () => {
  it('maps a tier per listing and keeps the reasons that back it', async () => {
    const rated = await rateFitBatch(
      [listing({ externalId: 'a-2' }), listing({ externalId: 'b-9' })],
      content,
      llmReturning({
        ratings: [
          {
            externalId: 'a-2',
            tier: 'strong',
            reasons: [
              { text: 'Owns a payments ledger', citations: ['experience[0].bullets[0]'] },
              { text: 'No gRPC anywhere in the résumé', citations: [], gap: true },
            ],
          },
          {
            externalId: 'b-9',
            tier: 'possible',
            reasons: [{ text: 'Platform-adjacent', citations: [] }],
          },
        ],
      }),
    )

    expect([...rated.keys()].sort()).toEqual(['a-2', 'b-9'])
    expect(rated.get('a-2')?.tier).toBe('strong')
    expect(rated.get('a-2')?.reasons[0].citations).toEqual(['experience[0].bullets[0]'])
    expect(rated.get('a-2')?.reasons[1].gap).toBe(true)
    expect(rated.get('b-9')?.tier).toBe('possible')
  })

  it('cannot carry a number, whatever the model returns', async () => {
    const rated = await rateFitBatch(
      [listing({ externalId: 'a-2' })],
      content,
      llmReturning({
        ratings: [
          {
            externalId: 'a-2',
            tier: 'possible',
            score: 78,
            percentage: 78,
            reasons: [{ text: 'Adjacent platform work', citations: [], confidence: 0.8 }],
          },
        ],
      }),
    )

    expect(JSON.stringify([...rated.values()])).not.toMatch(
      /"(score|percent|percentage|grade|confidence)"\s*:/i,
    )
  })

  it('ignores an externalId that was never in the search results', async () => {
    const rated = await rateFitBatch(
      [listing({ externalId: 'a-2' })],
      content,
      llmReturning({
        ratings: [
          { externalId: 'a-2', tier: 'reach', reasons: [{ text: 'Different stack', gap: true }] },
          { externalId: 'ghost-1', tier: 'strong', reasons: [{ text: 'Invented listing' }] },
        ],
      }),
    )

    expect([...rated.keys()]).toEqual(['a-2'])
  })

  it('leaves an unrated listing out of the map rather than inventing a tier', async () => {
    const rated = await rateFitBatch(
      [listing({ externalId: 'a-2' }), listing({ externalId: 'b-9' })],
      content,
      llmReturning({
        ratings: [{ externalId: 'a-2', tier: 'strong', reasons: [{ text: 'Ledger work' }] }],
      }),
    )

    expect(rated.has('b-9')).toBe(false)
    expect(rated.size).toBe(1)
  })

  it('drops a malformed entry without poisoning the rest of the batch', async () => {
    const rated = await rateFitBatch(
      [
        listing({ externalId: 'bad-tier' }),
        listing({ externalId: 'no-reasons' }),
        listing({ externalId: 'not-an-object' }),
        listing({ externalId: 'good' }),
      ],
      content,
      llmReturning({
        ratings: [
          { externalId: 'bad-tier', tier: '87%', reasons: [{ text: 'Rounded from a number' }] },
          { externalId: 'no-reasons', tier: 'strong', reasons: [] },
          'not-an-object',
          { externalId: 'good', tier: 'possible', reasons: [{ text: 'Kafka overlaps' }] },
        ],
      }),
    )

    expect([...rated.keys()]).toEqual(['good'])
    expect(rated.get('good')?.tier).toBe('possible')
  })

  it('survives a reply that is not JSON at all — the page just stays unrated', async () => {
    const rated = await rateFitBatch(
      [listing({ externalId: 'a-2' })],
      content,
      llmReturning('I would rather describe these roles in prose.'),
    )

    expect(rated.size).toBe(0)
  })

  it('chunks a big page and reuses one cached prefix across the calls', async () => {
    const listings = Array.from({ length: BATCH_SIZE * 2 + 1 }, (_, i) =>
      listing({ externalId: `job-${i}` }),
    )

    const llm = new FakeLlmProvider({
      responder: (request) => {
        const ids = [...request.messages[0].content.matchAll(/externalId: (\S+)/g)].map(
          (match) => match[1],
        )
        return JSON.stringify({
          ratings: ids.map((externalId) => ({
            externalId,
            tier: 'possible',
            reasons: [{ text: 'Adjacent backend work' }],
          })),
        })
      },
    })

    const rated = await rateFitBatch(listings, content, llm)

    expect(rated.size).toBe(listings.length)
    expect(llm.requests).toHaveLength(3)
    // Every chunk asks the same frozen prefix — the résumé is paid for once.
    expect(llm.requests.every((request) => request.system?.some((block) => block.cache))).toBe(true)
  })

  it('keeps every rating already collected when a later chunk fails', async () => {
    const listings = Array.from({ length: BATCH_SIZE + 3 }, (_, i) =>
      listing({ externalId: `job-${i}` }),
    )

    let calls = 0
    const llm = new FakeLlmProvider({
      responder: (request) => {
        if (++calls > 1) throw new Error('Fireworks returned 429 — rate limited')
        const ids = [...request.messages[0].content.matchAll(/externalId: (\S+)/g)].map(
          (match) => match[1],
        )
        return JSON.stringify({
          ratings: ids.map((externalId) => ({
            externalId,
            tier: 'possible',
            reasons: [{ text: 'Adjacent backend work' }],
          })),
        })
      },
    })

    const rated = await rateFitBatch(listings, content, llm)

    expect(rated.size).toBe(BATCH_SIZE)
    expect(rated.has('job-0')).toBe(true)
    expect(rated.has(`job-${BATCH_SIZE}`)).toBe(false)
  })

  it('surfaces the reason when every chunk fails rather than a silently unrated board', async () => {
    const llm = new FakeLlmProvider({
      responder: () => {
        throw new Error('Fireworks returned 429 — rate limited')
      },
    })

    await expect(rateFitBatch([listing({ externalId: 'a-2' })], content, llm)).rejects.toThrow(
      /429/,
    )
  })

  it('tags the request `kind:rate` and carries the batch discriminator', async () => {
    let seen: LlmRequest | null = null
    const llm = new FakeLlmProvider({
      responder: (request) => {
        seen = request
        return JSON.stringify({ ratings: [] })
      },
    })

    await rateFitBatch([listing({ externalId: 'a-2' })], content, llm)

    const request = seen as unknown as LlmRequest
    expect(promptKindOf(request)).toBe('rate')

    const text = [
      ...(request.system ?? []).map((block) => block.text),
      ...request.messages.map((message) => message.content),
    ].join('\n')
    // The literal `pickScript` dispatches on — see gates/fixtures/llm/rate-batch.json.
    expect(text).toContain('Rate each listing')
    expect(request.system?.[1]?.cache).toBe(true)
  })

  it('answers from the recorded batch fixture in test mode, not Phase 3’s', async () => {
    process.env.HUNT_TEST_MODE = '1'

    const rated = await rateFitBatch(
      [
        listing({ externalId: 'fake-1' }),
        listing({ externalId: 'fake-2' }),
        listing({ externalId: 'fake-3' }),
      ],
      content,
    )

    expect(rated.get('fake-1')?.tier).toBe('strong')
    expect(rated.get('fake-2')?.tier).toBe('possible')
    expect(rated.get('fake-3')?.reasons.length).toBeGreaterThan(1)
  })

  it('names the missing key rather than crashing when no model is configured', async () => {
    await expect(rateFitBatch([listing({ externalId: 'a-2' })], content, null)).rejects.toBeInstanceOf(
      FitUnavailableError,
    )
  })
})
