import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, probe, type ConnectionTestResult } from '../types'
import type { JobListing, JobQuery, JobsAdapter } from './types'

export const jsearchMeta: ProviderMeta = {
  id: 'jsearch',
  name: 'JSearch',
  category: 'jobs',
  ship: 'live',
  powers: 'Broad US job search across boards, via RapidAPI.',
  getKeyUrl: 'https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch',
  steps: [
    'Create a RapidAPI account and open the JSearch API page.',
    'Subscribe to the Basic (free) plan.',
    'Copy your RapidAPI key from the endpoint page and paste it here.',
  ],
  freeTier: 'Basic plan is free with a monthly request quota; overages are billed by RapidAPI.',
  degradation:
    'The Sourcing screen has no search results. Adding jobs by pasting a URL keeps working, and the free no-key boards still return listings.',
  fields: [{ key: 'apiKey', label: 'RapidAPI key', kind: 'secret', secret: true }],
  envFallback: 'JSEARCH_API_KEY',
}

const API_HOST = 'jsearch.p.rapidapi.com'

interface JSearchResponse {
  data?: {
    job_id?: string
    job_title?: string
    employer_name?: string
    job_city?: string
    job_state?: string
    job_apply_link?: string
    job_description?: string
    job_posted_at_datetime_utc?: string
    job_is_remote?: boolean
  }[]
  message?: string
}

/** US-first for v1 — other countries and salary data are a later concern. */
export class JSearchAdapter implements JobsAdapter {
  readonly id = 'jsearch'
  readonly meta = jsearchMeta

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers() {
    return { 'x-rapidapi-key': this.apiKey, 'x-rapidapi-host': API_HOST }
  }

  async search(query: JobQuery): Promise<JobListing[]> {
    const params = new URLSearchParams({
      query: [query.keywords, query.location].filter(Boolean).join(' in '),
      page: String(query.page ?? 1),
      country: 'us',
    })
    if (query.remoteOnly) params.set('work_from_home', 'true')

    const response = await this.fetchImpl(`https://${API_HOST}/search?${params}`, {
      headers: this.headers(),
    })
    const body = (await response.json().catch(() => ({}))) as JSearchResponse

    if (!response.ok) {
      throw new AdapterError('JSearch', body.message ?? `returned ${response.status}`, {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      })
    }

    return (body.data ?? []).map((job) => ({
      externalId: job.job_id ?? job.job_apply_link ?? crypto.randomUUID(),
      title: job.job_title ?? 'Untitled role',
      company: job.employer_name ?? 'Unknown',
      location: [job.job_city, job.job_state].filter(Boolean).join(', ') || undefined,
      url: job.job_apply_link ?? '',
      description: job.job_description,
      postedAt: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : undefined,
      remote: job.job_is_remote,
      source: 'jsearch',
    }))
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return probe('JSearch', () =>
      this.fetchImpl(`https://${API_HOST}/search?query=engineer&page=1&country=us`, {
        headers: this.headers(),
      }),
    )
  }
}
