import { jsearchMeta } from './jsearch'
import type { JobListing, JobQuery, JobsAdapter } from './types'

import type { ConnectionTestResult } from '../types'

const DEFAULT_FIXTURES: JobListing[] = [
  {
    externalId: 'fake-1',
    title: 'Senior Backend Engineer',
    company: 'Northwind Robotics',
    location: 'Austin, TX',
    url: 'https://jobs.example.com/northwind/senior-backend-engineer',
    description:
      'We are looking for a senior backend engineer with deep Python and distributed systems experience to own our fleet-coordination services.',
    postedAt: new Date('2026-07-01T00:00:00Z'),
    remote: false,
    source: 'fake-jobs',
  },
  {
    externalId: 'fake-2',
    title: 'Platform Engineer (Remote)',
    company: 'Meridian Health',
    location: 'Remote — US',
    url: 'https://jobs.example.com/meridian/platform-engineer',
    description:
      'Own the Kubernetes and CI platform that ships our clinical data pipelines. Go, Terraform, and a bias for reliability.',
    postedAt: new Date('2026-07-10T00:00:00Z'),
    remote: true,
    source: 'fake-jobs',
  },
  // The remote backend role. Sourcing's saved-search path filters on
  // `{keywords:'backend', remoteOnly:true}`, and fake-1 is on-site while fake-2
  // never says "backend" — without this fixture that query is empty and no
  // rated-results screen can be exercised on fakes.
  {
    externalId: 'fake-3',
    title: 'Backend Engineer, Payments',
    company: 'Halcyon Pay',
    location: 'Remote — US',
    url: 'https://jobs.example.com/halcyon/backend-engineer-payments',
    description:
      'Backend engineer for our payments core: Go services, distributed systems, ledger correctness and idempotent retries across card processors.',
    postedAt: new Date('2026-07-14T00:00:00Z'),
    remote: true,
    source: 'fake-jobs',
  },
]

export class FakeJobsAdapter implements JobsAdapter {
  readonly id = 'fake-jobs'
  readonly meta = jsearchMeta
  readonly queries: JobQuery[] = []

  constructor(private readonly fixtures: JobListing[] = DEFAULT_FIXTURES) {}

  async search(query: JobQuery): Promise<JobListing[]> {
    this.queries.push(query)

    const needle = query.keywords.toLowerCase()
    const matches = this.fixtures.filter(
      (job) =>
        job.title.toLowerCase().includes(needle) ||
        (job.description ?? '').toLowerCase().includes(needle),
    )
    // An empty keyword should still return the fixture set, not nothing.
    const results = needle ? matches : this.fixtures
    return query.remoteOnly ? results.filter((job) => job.remote) : results
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, detail: '200 · 0ms · fixture', status: 200, durationMs: 0 }
  }
}
