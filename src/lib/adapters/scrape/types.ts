import type { Adapter } from '../types'

export interface ScrapedPage {
  url: string
  title?: string
  /** Markdown is what the LLM reads — clean, cheap, structure-preserving. */
  markdown: string
  html?: string
  fetchedAt: Date
}

export interface ScrapeAdapter extends Adapter {
  scrape(url: string): Promise<ScrapedPage>
}
