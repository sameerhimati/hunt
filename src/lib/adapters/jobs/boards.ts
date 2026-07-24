import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, probe, type ConnectionTestResult } from '../types'
import type { JobListing, JobQuery, JobsAdapter } from './types'

/**
 * The works-before-any-key tier. Greenhouse, Lever, Ashby and Remotive all
 * expose public JSON — a brand-new user gets real listings before they have
 * pasted a single credential. That first-run moment is worth the extra adapter.
 */
export const freeBoardsMeta: ProviderMeta = {
  id: 'free_boards',
  name: 'Public job boards',
  category: 'jobs',
  ship: 'live',
  powers: 'Greenhouse, Lever, Ashby and Remotive listings — no key required.',
  getKeyUrl: '',
  steps: ['Nothing to configure. These boards are public and always on.'],
  freeTier: 'Free and unauthenticated.',
  degradation: 'Not applicable — this source needs no key and cannot be turned off.',
  fields: [
    {
      key: 'companies',
      label: 'Company board tokens',
      kind: 'text',
      optional: true,
      help: 'Comma-separated Greenhouse/Lever/Ashby board names to watch, e.g. stripe, figma.',
    },
  ],
}

interface RemotiveResponse {
  jobs?: {
    id?: number
    title?: string
    company_name?: string
    candidate_required_location?: string
    url?: string
    description?: string
    publication_date?: string
  }[]
}

const REMOTIVE_API = 'https://remotive.com/api/remote-jobs'

export class FreeBoardsAdapter implements JobsAdapter {
  readonly id = 'free_boards'
  readonly meta = freeBoardsMeta

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async search(query: JobQuery): Promise<JobListing[]> {
    const params = new URLSearchParams({ search: query.keywords, limit: '25' })
    const response = await this.fetchImpl(`${REMOTIVE_API}?${params}`)

    if (!response.ok) {
      throw new AdapterError('Public boards', `Remotive returned ${response.status}`, {
        status: response.status,
        retryable: response.status >= 500,
      })
    }

    const body = (await response.json().catch(() => ({}))) as RemotiveResponse

    return (body.jobs ?? []).map((job) => ({
      externalId: `remotive-${job.id}`,
      title: job.title ?? 'Untitled role',
      company: job.company_name ?? 'Unknown',
      location: job.candidate_required_location,
      url: job.url ?? '',
      description: job.description,
      postedAt: job.publication_date ? new Date(job.publication_date) : undefined,
      remote: true,
      source: 'remotive',
    }))
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return probe('Public boards', () => this.fetchImpl(`${REMOTIVE_API}?limit=1`))
  }
}
