import { firecrawlMeta } from './firecrawl'
import type { ScrapeAdapter, ScrapedPage } from './types'

import { AdapterError, type ConnectionTestResult } from '../types'

/**
 * Fixture-backed scrape. Tests and e2e run on this so the suite needs no key and
 * no network; an unknown URL fails the way the real adapter does rather than
 * silently returning an empty page.
 */
export class FakeScrapeAdapter implements ScrapeAdapter {
  readonly id = 'fake-scrape'
  readonly meta = firecrawlMeta
  readonly scrapedUrls: string[] = []

  constructor(private readonly fixtures: Record<string, Omit<ScrapedPage, 'fetchedAt'>> = {}) {}

  async scrape(url: string): Promise<ScrapedPage> {
    this.scrapedUrls.push(url)

    const fixture = this.fixtures[url]
    if (!fixture) {
      throw new AdapterError('FakeScrape', `no fixture registered for ${url}`, { status: 404 })
    }

    return { ...fixture, fetchedAt: new Date('2026-01-01T00:00:00Z') }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, detail: '200 · 0ms · fixture', status: 200, durationMs: 0 }
  }
}
