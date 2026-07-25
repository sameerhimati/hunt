import { createAdapter } from '@/lib/adapters/factory'
import type { ScrapeAdapter, ScrapedPage } from '@/lib/adapters/scrape/types'
import { AdapterError } from '@/lib/adapters/types'
import { prisma } from '@/lib/db/client'
import { asResolvedLlm, resolveLlm, type LlmLike } from '@/lib/llm'
import { runPrompt } from '@/lib/llm/prompts'
import { extractJobMessage, extractJobSystem } from '@/lib/llm/prompts/jobs'

/**
 * Paste a URL, get a job.
 *
 * Order matters here and is the whole design: scrape first, extract second,
 * write last. A scrape failure has to surface verbatim ("Firecrawl returned
 * 402 — over plan limit") with *nothing* written, because a half-populated Job
 * row is worse than no row — it looks like data and behaves like a bug.
 *
 * The LLM step is optional. With no key configured, the title/company are read
 * off the page title instead; degraded, clearly, but the pipeline still works.
 * That is the keyless floor the product promises.
 */

export interface IngestDeps {
  /** Injected by tests and gates; production resolves Firecrawl from settings. */
  scrape?: ScrapeAdapter
  llm?: LlmLike | null
}

export interface ExtractedJob {
  title: string
  company: string
  location: string | null
  companyBlurb: string | null
}

async function resolveScrape(injected?: ScrapeAdapter): Promise<ScrapeAdapter> {
  if (injected) return injected

  const adapter = (await createAdapter('firecrawl')) as ScrapeAdapter | null
  if (!adapter) {
    throw new AdapterError(
      'Firecrawl',
      'no API key configured — add one in Settings, or add this job manually.',
    )
  }
  return adapter
}

/**
 * Fallback identity when no model is available: job pages title themselves
 * "Senior Backend Engineer — Stripe" often enough for this to beat nothing,
 * and the user can correct both fields on the application page.
 */
export function identityFromPage(page: ScrapedPage, url: string): ExtractedJob {
  const heading = page.title?.trim() || firstHeading(page.markdown) || url
  const [title, company] = heading.split(/\s+[—–|·-]\s+/)

  return {
    title: (title ?? heading).trim(),
    company: (company ?? new URL(url).hostname.replace(/^www\./, '')).trim(),
    location: null,
    companyBlurb: null,
  }
}

function firstHeading(markdown: string): string | null {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null
}

function coerceExtraction(raw: unknown, fallback: ExtractedJob): ExtractedJob {
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Record<string, unknown>
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string).trim() : '')

  return {
    title: text('title') || fallback.title,
    company: text('company') || fallback.company,
    location: text('location') || null,
    companyBlurb: text('companyBlurb') || null,
  }
}

async function extractIdentity(
  page: ScrapedPage,
  url: string,
  llm: LlmLike | null | undefined,
): Promise<ExtractedJob> {
  const fallback = identityFromPage(page, url)

  const resolved = llm === null ? null : llm ? asResolvedLlm(llm) : await resolveLlm()
  if (!resolved) return fallback

  const response = await runPrompt({
    llm: resolved.provider,
    model: resolved.model,
    kind: 'extract',
    system: extractJobSystem(),
    messages: [{ role: 'user', content: extractJobMessage(page.markdown, url) }],
    maxTokens: 1000,
  })

  try {
    const start = response.text.indexOf('{')
    const end = response.text.lastIndexOf('}')
    if (start === -1 || end <= start) return fallback
    return coerceExtraction(JSON.parse(response.text.slice(start, end + 1)), fallback)
  } catch {
    // A model that returns prose shouldn't cost the user the whole ingest.
    return fallback
  }
}

export async function ingestJobUrl(url: string, deps: IngestDeps = {}) {
  const scrape = await resolveScrape(deps.scrape)

  // Any AdapterError from here propagates untouched, before a single write.
  const page = await scrape.scrape(url)
  const identity = await extractIdentity(page, url, deps.llm)

  const data = {
    url,
    title: identity.title,
    company: identity.company,
    location: identity.location,
    jdText: page.markdown,
    companyBlurb: identity.companyBlurb,
    source: 'paste',
    scrapedAt: page.fetchedAt,
  }

  // Re-pasting a URL refreshes the posting rather than erroring on the unique
  // index — people paste the same link twice all the time.
  return prisma.job.upsert({ where: { url }, create: data, update: data })
}

export interface ManualJobInput {
  title: string
  company: string
  location?: string | null
  jdText?: string | null
  url?: string | null
}

/** The zero-key floor: type the two fields you always know. */
export async function createManualJob(input: ManualJobInput) {
  const title = input.title.trim()
  const company = input.company.trim()
  if (!title || !company) {
    throw new Error('A job needs at least a title and a company.')
  }

  return prisma.job.create({
    data: {
      title,
      company,
      location: input.location?.trim() || null,
      jdText: input.jdText?.trim() ?? '',
      url: input.url?.trim() || null,
      source: 'manual',
    },
  })
}
