import { describe, expect, it } from 'vitest'

import { FakeScrapeAdapter } from '@/lib/adapters/scrape/fake'
import { prisma } from '@/lib/db/client'
import { FakeLlmProvider } from '@/lib/llm'
import { createManualJob, identityFromPage, ingestJobUrl, updateJob } from '@/lib/jobs/ingest'

const URL_ONE = 'https://jobs.example.com/acme/staff-engineer'

/**
 * A fresh posting per test. Jobs are keyed by URL and the row outlives the test
 * that created it, so sharing one URL would silently couple these cases — a
 * test asserting the create path would end up exercising the refresh path
 * depending on what ran before it.
 */
function posting(slug: string) {
  const url = `https://jobs.example.com/acme/${slug}`
  const scrape = new FakeScrapeAdapter({
    [url]: {
      url,
      title: 'Staff Engineer — Acme',
      markdown: '# Staff Engineer\n\nAcme is hiring. You will own the ingestion pipeline.',
    },
  })
  return { url, scrape }
}

const scrape = posting('staff-engineer').scrape

describe('ingestJobUrl', () => {
  it('works with no model at all — the keyless floor', async () => {
    const job = await ingestJobUrl(URL_ONE, { scrape, llm: null })

    expect(job.title).toBe('Staff Engineer')
    expect(job.company).toBe('Acme')
    expect(job.jdText).toContain('ingestion pipeline')
    expect(job.source).toBe('paste')
  })

  it('re-pasting the same URL refreshes the posting instead of failing', async () => {
    const { url, scrape: page } = posting('repeat-paste')

    await ingestJobUrl(url, { scrape: page, llm: null })
    const again = await ingestJobUrl(url, { scrape: page, llm: null })

    expect(await prisma.job.count({ where: { url } })).toBe(1)
    expect(again.url).toBe(url)
  })

  it('re-pasting does not overwrite an identity the user corrected by hand', async () => {
    const { url, scrape: page } = posting('hand-corrected')
    const job = await ingestJobUrl(url, { scrape: page, llm: null })

    // The user fixes the scraper's guess on the application page.
    await prisma.job.update({
      where: { id: job.id },
      data: { title: 'Staff Engineer, Ingestion', company: 'Acme Corporation' },
    })

    const again = await ingestJobUrl(url, { scrape: page, llm: null })

    expect(again.title).toBe('Staff Engineer, Ingestion')
    expect(again.company).toBe('Acme Corporation')
    // The scrape-derived half still refreshes.
    expect(again.jdText).toContain('ingestion pipeline')
  })

  it('keeps the scraped description verbatim even when the model rewrites the identity', async () => {
    const { url, scrape: page } = posting('model-identity')
    const llm = new FakeLlmProvider({
      responder: () =>
        JSON.stringify({ title: 'Staff Software Engineer', company: 'Acme Corp', location: 'Remote' }),
    })

    const job = await ingestJobUrl(url, { scrape: page, llm })
    expect(job.title).toBe('Staff Software Engineer')
    expect(job.location).toBe('Remote')
    expect(job.jdText).toContain('Acme is hiring')
  })

  it('falls back to the page identity when the model answers with prose', async () => {
    const { url, scrape: page } = posting('prose-reply')
    const llm = new FakeLlmProvider({ reply: 'Sure! Here is the job you asked about.' })

    const job = await ingestJobUrl(url, { scrape: page, llm })
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

describe('updateJob', () => {
  it('fills in what import left blank', async () => {
    const job = await createManualJob({ title: 'Product Engineer', company: 'Y Combinator' })
    expect(job.location).toBeNull()

    const fixed = await updateJob(job.id, {
      title: job.title,
      company: job.company,
      location: 'San Francisco',
      jdText: 'Location: San Francisco. You will build the software that runs YC.',
    })

    expect(fixed.location).toBe('San Francisco')
    expect(fixed.jdText).toContain('runs YC')
  })

  it('holds the same floor as creating one', async () => {
    const job = await createManualJob({ title: 'Product Engineer', company: 'Firecrawl' })

    await expect(updateJob(job.id, { title: '   ', company: 'Firecrawl' })).rejects.toThrow(
      /title and a company/,
    )

    // The bad save changed nothing.
    const unchanged = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(unchanged.title).toBe('Product Engineer')
  })

  it('leaves the source alone — editing a scrape does not make it typed', async () => {
    const { url, scrape: adapter } = posting('source-survives-an-edit')
    const scraped = await ingestJobUrl(url, { scrape: adapter, llm: null })
    expect(scraped.source).not.toBe('manual')

    const edited = await updateJob(scraped.id, {
      title: 'Staff Engineer',
      company: 'Acme',
      location: 'Remote',
    })

    expect(edited.source).toBe(scraped.source)
  })

  it('stores the description verbatim, because the checks cite it', async () => {
    const job = await createManualJob({ title: 'Context Engineer', company: 'PostHog' })
    const pasted = 'Line one.\n\n  Line two, indented.\n'

    const edited = await updateJob(job.id, {
      title: job.title,
      company: job.company,
      jdText: pasted,
    })

    expect(edited.jdText).toBe(pasted.trim())
  })
})
