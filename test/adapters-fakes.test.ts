import { describe, expect, it } from 'vitest'

import { FakeEmailAdapter } from '@/lib/adapters/email/fake'
import { FakeJobsAdapter } from '@/lib/adapters/jobs/fake'
import { FakePeopleAdapter } from '@/lib/adapters/people/fake'
import { FakeScrapeAdapter } from '@/lib/adapters/scrape/fake'
import { LinkedInCookieAdapter } from '@/lib/adapters/linkedin/cookie'
import { AdapterError, NotWiredError } from '@/lib/adapters/types'

describe('fake adapters', () => {
  it('scrapes a registered fixture', async () => {
    const scrape = new FakeScrapeAdapter({
      'https://jobs.example.com/role': {
        url: 'https://jobs.example.com/role',
        title: 'Senior Backend Engineer',
        markdown: '# Senior Backend Engineer\n\nPython, distributed systems.',
      },
    })

    const page = await scrape.scrape('https://jobs.example.com/role')
    expect(page.title).toBe('Senior Backend Engineer')
    expect(page.markdown).toContain('Python')
    expect(scrape.scrapedUrls).toEqual(['https://jobs.example.com/role'])
  })

  it('fails loudly on an unregistered URL instead of returning an empty page', async () => {
    const scrape = new FakeScrapeAdapter({})
    await expect(scrape.scrape('https://unknown.example.com')).rejects.toBeInstanceOf(AdapterError)
  })

  it('searches fixture jobs and honours remoteOnly', async () => {
    const jobs = new FakeJobsAdapter()

    const all = await jobs.search({ keywords: 'engineer' })
    expect(all.length).toBeGreaterThan(0)

    const remote = await jobs.search({ keywords: 'engineer', remoteOnly: true })
    expect(remote.every((job) => job.remote)).toBe(true)
    expect(jobs.queries).toHaveLength(2)
  })

  it('returns fixture contacts capped by the limit', async () => {
    const people = new FakePeopleAdapter()
    const hits = await people.findContacts({ company: 'Northwind Robotics', limit: 1 })

    expect(hits).toHaveLength(1)
    expect(hits[0].source).toBe('fake-apollo')
  })

  it('captures sent mail in an in-memory outbox', async () => {
    const email = new FakeEmailAdapter()
    const result = await email.send({
      to: 'dana@example.com',
      from: 'me@example.com',
      subject: 'Backend role',
      text: 'Hello Dana —',
    })

    expect(result.messageId).toContain('@hunt.local')
    expect(email.outbox).toHaveLength(1)
    expect(email.outbox[0].subject).toBe('Backend role')
  })

  it('reports a healthy test connection without touching the network', async () => {
    for (const adapter of [
      new FakeScrapeAdapter({}),
      new FakeJobsAdapter(),
      new FakePeopleAdapter(),
      new FakeEmailAdapter(),
    ]) {
      const result = await adapter.testConnection()
      expect(result.ok).toBe(true)
      expect(result.detail).toContain('fixture')
    }
  })
})

describe('the dormant LinkedIn seam', () => {
  // Phase 6 was cancelled; this adapter is kept unregistered so the shape
  // survives. These assert it stays inert — if it ever silently starts working,
  // a user's own LinkedIn account is what pays for the surprise.
  it('fails with a scope explanation, not a mystery crash', async () => {
    await expect(new LinkedInCookieAdapter().findPeopleAtCompany('Acme')).rejects.toBeInstanceOf(
      NotWiredError,
    )
  })

  it('reports an honest failed connection test', async () => {
    const result = await new LinkedInCookieAdapter().testConnection()
    expect(result.ok).toBe(false)
    expect(result.detail).toMatch(/stub/i)
  })
})
