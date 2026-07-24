import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, probe, type ConnectionTestResult } from '../types'
import type { ScrapeAdapter, ScrapedPage } from './types'

export const firecrawlMeta: ProviderMeta = {
  id: 'firecrawl',
  name: 'Firecrawl',
  category: 'scrape',
  ship: 'live',
  powers: 'Paste-a-URL job and company scraping.',
  getKeyUrl: 'https://www.firecrawl.dev/app/api-keys',
  steps: [
    'Sign in at firecrawl.dev and open the dashboard.',
    'Go to API Keys and copy the key beginning with `fc-`.',
    'Paste it here and hit Test connection.',
  ],
  freeTier: '500 one-off credits on signup, then a metered free tier — roughly 500 job pages.',
  degradation:
    'Pasting a job URL stops auto-filling. You can still add jobs by pasting the description text manually — nothing else in hunt is affected.',
  fields: [
    {
      key: 'apiKey',
      label: 'API key',
      kind: 'secret',
      secret: true,
      placeholder: 'fc-…',
    },
  ],
  envFallback: 'FIRECRAWL_API_KEY',
}

const API_BASE = 'https://api.firecrawl.dev/v2'

interface FirecrawlScrapeResponse {
  success?: boolean
  error?: string
  data?: {
    markdown?: string
    html?: string
    metadata?: { title?: string; sourceURL?: string }
  }
}

export class FirecrawlAdapter implements ScrapeAdapter {
  readonly id = 'firecrawl'
  readonly meta = firecrawlMeta

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async scrape(url: string): Promise<ScrapedPage> {
    const response = await this.fetchImpl(`${API_BASE}/scrape`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    })

    const body = (await response.json().catch(() => ({}))) as FirecrawlScrapeResponse

    if (!response.ok || body.success === false) {
      throw new AdapterError('Firecrawl', body.error ?? `returned ${response.status}`, {
        status: response.status,
        // 402 = out of credits, 429 = rate limited: both worth retrying later.
        retryable: response.status === 429 || response.status >= 500,
      })
    }

    return {
      url: body.data?.metadata?.sourceURL ?? url,
      title: body.data?.metadata?.title,
      markdown: body.data?.markdown ?? '',
      html: body.data?.html,
      fetchedAt: new Date(),
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // The credit-usage endpoint authenticates without spending a credit.
    return probe('Firecrawl', () =>
      this.fetchImpl(`${API_BASE}/team/credit-usage`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      }),
    )
  }
}
