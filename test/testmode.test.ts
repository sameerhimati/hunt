import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAdapter } from '@/lib/adapters/factory'
import type { ScrapeAdapter } from '@/lib/adapters/scrape/types'
import { AdapterError } from '@/lib/adapters/types'
import { resolveLlm } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { fixturePath } from '@/lib/testmode'

const stripe = JSON.parse(fs.readFileSync(fixturePath('jobs/stripe-sbe.json'), 'utf8'))

describe('HUNT_TEST_MODE', () => {
  beforeEach(() => {
    process.env.HUNT_TEST_MODE = '1'
  })

  afterEach(() => {
    delete process.env.HUNT_TEST_MODE
  })

  it('serves fixture-backed adapters with no key stored', async () => {
    const scrape = (await createAdapter('firecrawl')) as ScrapeAdapter | null
    expect(scrape?.id).toBe('fake-scrape')

    const page = await scrape!.scrape(stripe.url)
    expect(page.markdown).toContain('latency SLOs')

    // An unrecorded URL fails the way Firecrawl would — fakes never invent data.
    await expect(scrape!.scrape('https://jobs.example.com/nowhere')).rejects.toThrow(AdapterError)
  })

  it('leaves LinkedIn off — test mode is not an opt-in', async () => {
    expect(await createAdapter('linkedin')).toBeNull()
  })

  it('resolves a scripted LLM that answers per promptKind', async () => {
    const resolved = await resolveLlm()
    expect(resolved?.provider.id).toBe('fake')

    const response = await runPrompt({
      llm: resolved!.provider,
      model: resolved!.model,
      kind: 'extract',
      maxTokens: 256,
      messages: [{ role: 'user', content: 'extract this JD' }],
    })

    expect(JSON.parse(response.text)).toMatchObject({ company: stripe.expected.company })
  })

  it('names the fixture to record when a kind has no script', async () => {
    const resolved = await resolveLlm()

    await expect(
      runPrompt({
        llm: resolved!.provider,
        model: resolved!.model,
        kind: 'cover_letter',
        maxTokens: 256,
        messages: [{ role: 'user', content: 'write one' }],
      }),
    ).rejects.toThrow(/no scripted response for promptKind 'cover_letter'/)
  })

  it('honours HUNT_FIXTURES_DIR so a gate can point at its own recordings', () => {
    process.env.HUNT_FIXTURES_DIR = '/tmp/hunt-fixtures'
    try {
      expect(fixturePath('llm')).toBe(path.join('/tmp/hunt-fixtures', 'llm'))
    } finally {
      delete process.env.HUNT_FIXTURES_DIR
    }
  })

  it('stays off unless the env var is exactly 1', async () => {
    delete process.env.HUNT_TEST_MODE
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    // No keys are stored in the test data dir, so the real resolver degrades.
    expect(await resolveLlm()).toBeNull()
    expect(await createAdapter('firecrawl')).toBeNull()
  })
})
