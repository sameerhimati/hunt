import { describe, expect, it } from 'vitest'

import { FakeScrapeAdapter } from '@/lib/adapters/scrape/fake'
import { prisma } from '@/lib/db/client'
import { FakeLlmProvider } from '@/lib/llm'
import { createManualJob, identityFromPage, ingestJobUrl } from '@/lib/jobs/ingest'

const URL_ONE = 'https://jobs.example.com/acme/staff-engineer'

const scrape = new FakeScrapeAdapter({
  [URL_ONE]: {
    url: URL_ONE,
    title: 'Staff Engineer — Acme',
    markdown: '# Staff Engineer\n\nAcme is hiring. You will own the ingestion pipeline.',
  },
})

describe('ingestJobUrl', () => {
  it('works with no model at all — the keyless floor', async () => {
    const job = await ingestJobUrl(URL_ONE, { scrape, llm: null })

    expect(job.title).toBe('Staff Engineer')
    expect(job.company).toBe('Acme')
    expect(job.jdText).toContain('ingestion pipeline')
    expect(job.source).toBe('paste')
  })

  it('re-pasting the same URL refreshes the posting instead of failing', async () => {
    await ingestJobUrl(URL_ONE, { scrape, llm: null })
    const again = await ingestJobUrl(URL_ONE, { scrape, llm: null })

    expect(await prisma.job.count({ where: { url: URL_ONE } })).toBe(1)
    expect(again.url).toBe(URL_ONE)
  })

  it('keeps the scraped description verbatim even when the model rewrites the identity', async () => {
    const llm = new FakeLlmProvider({
      responder: () =>
        JSON.stringify({ title: 'Staff Software Engineer', company: 'Acme Corp', location: 'Remote' }),
    })

    const job = await ingestJobUrl(URL_ONE, { scrape, llm })
    expect(job.title).toBe('Staff Software Engineer')
    expect(job.location).toBe('Remote')
    expect(job.jdText).toContain('Acme is hiring')
  })

  it('falls back to the page identity when the model answers with prose', async () => {
    const llm = new FakeLlmProvider({ reply: 'Sure! Here is the job you asked about.' })

    const job = await ingestJobUrl(URL_ONE, { scrape, llm })
    expect(job.title).toBe('Staff Engineer')
    expect(job.company).toBe('Acme')
  })
})

describe('identityFromPage', () => {
  it('falls back to the hostname when the title carries no company', () => {
    const identity = identityFromPage(
      { url: URL_ONE, title: 'Staff Engineer', markdown: '', fetchedAt: new Date() },
      URL_ONE,
    )
    expect(identity.company).toBe('jobs.example.com')
  })
})

describe('createManualJob', () => {
  it('requires the two fields you always know', async () => {
    await expect(createManualJob({ title: '  ', company: 'Linear' })).rejects.toThrow(
      /title and a company/,
    )
  })

  it('records the source so provenance survives', async () => {
    const job = await createManualJob({ title: 'Staff Engineer', company: 'Linear' })
    expect(job.source).toBe('manual')
    expect(job.url).toBeNull()
  })
})
