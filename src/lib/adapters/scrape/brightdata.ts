import type { ProviderMeta } from '@/lib/providers/types'

import { NotWiredError, type ConnectionTestResult } from '../types'
import type { ScrapeAdapter, ScrapedPage } from './types'

/**
 * Bright Data spans three adapter slots (scrape / jobs / people) as one BYOK
 * provider, and is the ToS-safer LinkedIn path versus the `li_at` cookie hack.
 * v1 ships it as a stub behind the same interface.
 */
export const brightDataScrapeMeta: ProviderMeta = {
  id: 'brightdata_scrape',
  name: 'Bright Data — Unblocker',
  category: 'scrape',
  ship: 'stub',
  powers: 'Fallback scraping for sites that block Firecrawl.',
  getKeyUrl: 'https://brightdata.com/cp/api_tokens',
  steps: [
    'Create a Bright Data account and open Account settings → API tokens.',
    'Generate a token with Web Unlocker permissions.',
    'Paste it here — hunt will use it only when Firecrawl fails.',
  ],
  freeTier: 'Pay-as-you-go per request; trial credit on signup. No perpetual free tier.',
  degradation:
    'Nothing breaks — Firecrawl handles almost every job board. This is a fallback for sites behind hard bot protection.',
  fields: [{ key: 'apiKey', label: 'API token', kind: 'secret', secret: true, optional: true }],
}

export class BrightDataScrapeAdapter implements ScrapeAdapter {
  readonly id = 'brightdata_scrape'
  readonly meta = brightDataScrapeMeta

  async scrape(_url: string): Promise<ScrapedPage> {
    throw new NotWiredError('Bright Data', 'a post-v1 release')
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, detail: 'stub — not wired in v1' }
  }
}
