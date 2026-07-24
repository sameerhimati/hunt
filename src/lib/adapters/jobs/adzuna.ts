import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, probe, type ConnectionTestResult } from '../types'
import type { JobListing, JobQuery, JobsAdapter } from './types'

export const adzunaMeta: ProviderMeta = {
  id: 'adzuna',
  name: 'Adzuna',
  category: 'jobs',
  ship: 'live',
  powers: 'First-party job search API with a standing free tier.',
  getKeyUrl: 'https://developer.adzuna.com/signup',
  steps: [
    'Register at developer.adzuna.com — approval is instant.',
    'Copy both the Application ID and the Application Key.',
    'Paste them here; hunt queries the US index.',
  ],
  freeTier: 'Free tier allows a daily call quota, ample for personal job hunting.',
  degradation:
    'One fewer source on the Sourcing screen. JSearch and the free no-key boards still return results.',
  fields: [
    { key: 'appId', label: 'Application ID', kind: 'text', placeholder: 'e.g. 1a2b3c4d' },
    { key: 'appKey', label: 'Application key', kind: 'secret', secret: true },
  ],
  envFallback: 'ADZUNA_APP_KEY',
}

const API_BASE = 'https://api.adzuna.com/v1/api/jobs/us/search'

interface AdzunaResponse {
  results?: {
    id?: string
    title?: string
    company?: { display_name?: string }
    location?: { display_name?: string }
    redirect_url?: string
    description?: string
    created?: string
  }[]
  exception?: string
  doc?: string
}

/** US-only for v1, per PLAN.md — other countries are a later stub-upgrade. */
export class AdzunaAdapter implements JobsAdapter {
  readonly id = 'adzuna'
  readonly meta = adzunaMeta

  constructor(
    private readonly appId: string,
    private readonly appKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(query: JobQuery): string {
    const params = new URLSearchParams({
      app_id: this.appId,
      app_key: this.appKey,
      what: query.keywords,
      results_per_page: '20',
    })
    if (query.location) params.set('where', query.location)
    return `${API_BASE}/${query.page ?? 1}?${params}`
  }

  async search(query: JobQuery): Promise<JobListing[]> {
    const response = await this.fetchImpl(this.url(query))
    const body = (await response.json().catch(() => ({}))) as AdzunaResponse

    if (!response.ok) {
      throw new AdapterError('Adzuna', body.exception ?? body.doc ?? `returned ${response.status}`, {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      })
    }

    return (body.results ?? []).map((job) => ({
      externalId: String(job.id ?? job.redirect_url),
      title: job.title ?? 'Untitled role',
      company: job.company?.display_name ?? 'Unknown',
      location: job.location?.display_name,
      url: job.redirect_url ?? '',
      description: job.description,
      postedAt: job.created ? new Date(job.created) : undefined,
      source: 'adzuna',
    }))
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return probe('Adzuna', () => this.fetchImpl(this.url({ keywords: 'engineer' })))
  }
}
