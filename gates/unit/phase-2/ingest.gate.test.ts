import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 2 exit gate — paste-a-URL ingest. RED until src/lib/jobs/ingest.ts exists.
// Contract: ingestJobUrl(url, deps?) accepts injected { scrape, llm } so tests
// and HUNT_TEST_MODE share one code path with production.
import { ingestJobUrl } from '@/lib/jobs/ingest'
import { FakeScrapeAdapter } from '@/lib/adapters/scrape/fake'
import { FakeLlmProvider } from '@/lib/llm'
import { AdapterError } from '@/lib/adapters/types'
import { prisma } from '@/lib/db/client'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const jdMarkdown = fs.readFileSync(path.join(FIXTURES, 'jobs/stripe-sbe.md'), 'utf8')
const { url, expected } = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'jobs/stripe-sbe.json'), 'utf8'),
)

const scrape = new FakeScrapeAdapter({
  [url]: { url, title: 'Senior Backend Engineer — Stripe', markdown: jdMarkdown },
})

const llm = new FakeLlmProvider({
  responder: () =>
    JSON.stringify({
      title: expected.title,
      company: expected.company,
      location: expected.location,
      companyBlurb: 'Stripe builds economic infrastructure for the internet.',
    }),
})

describe('URL ingest', () => {
  it('turns a pasted URL into a Job row with the JD text', async () => {
    const job = await ingestJobUrl(url, { scrape, llm })

    expect(job.title).toBe(expected.title)
    expect(job.company).toBe(expected.company)
    expect(job.location).toBe(expected.location)
    expect(job.jdText).toContain('latency SLOs')
    expect(job.source).toBe('paste')

    const row = await prisma.job.findUnique({ where: { url } })
    expect(row?.company).toBe(expected.company)
  })

  it('surfaces scrape failures verbatim and writes no partial row', async () => {
    const missing = 'https://jobs.example.com/nowhere'
    await expect(ingestJobUrl(missing, { scrape, llm })).rejects.toThrow(AdapterError)
    expect(await prisma.job.findUnique({ where: { url: missing } })).toBeNull()
  })
})
