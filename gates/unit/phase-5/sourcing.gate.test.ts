import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 5 exit gate — multi-adapter search, dedupe, batch fit rating, pull-in.
// RED until src/lib/sourcing/* and src/lib/fit/batch.ts exist.
import { searchJobs } from '@/lib/sourcing/search'
import { rateFitBatch } from '@/lib/fit/batch'
import { pullIntoPipeline } from '@/lib/sourcing/import'
import { saveSearch, runSavedSearch } from '@/lib/sourcing/saved'
import { FakeJobsAdapter } from '@/lib/adapters/jobs/fake'
import { FakeLlmProvider } from '@/lib/llm'
import { parseResumeContent } from '@/lib/resume/schema'
import { prisma } from '@/lib/db/client'
import type { JobListing } from '@/lib/adapters/jobs/types'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))

const listing = (overrides: Partial<JobListing>): JobListing => ({
  externalId: 'x',
  title: 'Senior Backend Engineer',
  company: 'Northwind Robotics',
  url: 'https://jobs.example.com/x',
  source: 'fake-jobs',
  ...overrides,
})

describe('search', () => {
  it('merges adapters and dedupes by externalId', async () => {
    const a = new FakeJobsAdapter([
      listing({ externalId: 'dup-1', title: 'Senior Backend Engineer' }),
      listing({ externalId: 'a-2', title: 'Backend Engineer, Fleet' }),
    ])
    const b = new FakeJobsAdapter([
      listing({ externalId: 'dup-1', title: 'Senior Backend Engineer' }),
      listing({ externalId: 'b-9', title: 'Backend Platform Engineer' }),
    ])

    const results = await searchJobs({ keywords: 'backend' }, { adapters: [a, b] })
    expect(results.map((r: JobListing) => r.externalId).sort()).toEqual(['a-2', 'b-9', 'dup-1'])
  })
})

describe('batch fit rating', () => {
  it('rates every listing with a tier and reasons — never a number', async () => {
    const listings = [
      listing({ externalId: 'a-2', title: 'Backend Engineer, Fleet' }),
      listing({ externalId: 'b-9', title: 'Backend Platform Engineer' }),
    ]
    const llm = new FakeLlmProvider({
      responder: () =>
        JSON.stringify({
          ratings: [
            { externalId: 'a-2', tier: 'strong', reasons: [{ text: 'Go + distributed systems', citations: ['skills[0].items[0]'] }] },
            { externalId: 'b-9', tier: 'possible', reasons: [{ text: 'Platform-adjacent', citations: [] }] },
          ],
        }),
    })

    const rated = await rateFitBatch(listings, parseResumeContent(alexChen), llm)
    expect(rated.get('a-2')?.tier).toBe('strong')
    expect(rated.get('b-9')?.tier).toBe('possible')
    expect(JSON.stringify([...rated.values()])).not.toMatch(/"(score|percent|percentage)"\s*:/i)
  })
})

describe('pull into pipeline', () => {
  it('creates a sourced application from a listing', async () => {
    const { job, application } = await pullIntoPipeline(
      listing({ externalId: 'pull-1', url: `https://jobs.example.com/pull-${Math.random()}` }),
    )
    expect(job.source).toBe('api')
    expect(application.status).toBe('sourced')
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toBeTruthy()
  })
})

describe('saved searches', () => {
  it('re-runs a saved query and records the SourcingRun', async () => {
    const saved = await saveSearch({ keywords: 'backend', remoteOnly: true })
    const run = await runSavedSearch(saved.id, { adapters: [new FakeJobsAdapter()] })

    expect(run.resultCount).toBeGreaterThan(0)
    const rows = await prisma.sourcingRun.findMany()
    expect(rows.some((r) => r.id === run.id)).toBe(true)
  })
})
