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

/**
 * The board payload shapes, and the mappers that turn them into listings.
 *
 * Both are exported because the *list* endpoints are no longer the only caller:
 * pasting a posting URL fetches the same job one at a time (see `./posting`),
 * and the two paths have to produce identical `JobListing`s — the externalId is
 * the sourcing dedupe key, so a second copy of the field mapping would deal a
 * duplicate pipeline card the day one copy drifted.
 *
 * The envelopes differ per board even though the elements do not: Greenhouse's
 * single-job route returns the job bare, Lever's likewise, and Ashby has no
 * single-job route at all. That is exactly why the element types are exported
 * and the envelopes are not part of the mapper's signature.
 */

export interface GreenhouseJob {
  id?: number | string
  title?: string
  absolute_url?: string
  updated_at?: string
  content?: string
  location?: { name?: string }
  company_name?: string
}

export interface GreenhouseResponse {
  jobs?: GreenhouseJob[]
}

export interface LeverJob {
  id?: string
  text?: string
  hostedUrl?: string
  createdAt?: number
  workplaceType?: string
  description?: string
  descriptionPlain?: string
  categories?: { location?: string; team?: string; commitment?: string }
}

export type LeverResponse = LeverJob[]

export interface AshbyJob {
  id?: string
  title?: string
  jobUrl?: string
  location?: string
  isRemote?: boolean
  publishedAt?: string
  descriptionPlain?: string
  organizationName?: string
}

export interface AshbyResponse {
  jobs?: AshbyJob[]
}

const REMOTIVE_API = 'https://remotive.com/api/remote-jobs'

/** The per-company boards. Remotive is keyword-wide and always on beside them. */
const COMPANY_BOARDS = ['greenhouse', 'lever', 'ashby'] as const
export type CompanyBoard = (typeof COMPANY_BOARDS)[number]

export interface BoardTarget {
  board: CompanyBoard
  token: string
}

/**
 * Turns the user's `companies` setting into board/token pairs.
 *
 * A bare token is tried on all three boards: the user knows the company, not
 * which ATS it bought, and asking them would be a worse product than three
 * cheap public GETs of which two 404 harmlessly. `lever:figma` pins one board
 * for people who do know.
 */
export function parseBoardTargets(companies: string | null | undefined): BoardTarget[] {
  const targets: BoardTarget[] = []
  const seen = new Set<string>()

  for (const raw of (companies ?? '').split(',')) {
    const entry = raw.trim()
    if (!entry) continue

    const [head, ...rest] = entry.split(':')
    const pinned = COMPANY_BOARDS.find((board) => board === head.trim().toLowerCase())
    const token = (pinned ? rest.join(':') : entry).trim()
    if (!token) continue

    for (const board of pinned ? [pinned] : COMPANY_BOARDS) {
      const key = `${board}:${token.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      targets.push({ board, token })
    }
  }

  return targets
}

function titleCase(token: string): string {
  return token
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

function looksRemote(...values: (string | undefined)[]): boolean {
  return values.some((value) => (value ?? '').toLowerCase().includes('remote'))
}

/**
 * `org` is the board token — from the `companies` setting on the search path,
 * from the pasted URL on the paste path. It carries the `externalId` and, for
 * Lever, doubles as the company name: Lever's payload never names the company.
 */
export function greenhouseListing(job: GreenhouseJob, org: string): JobListing {
  return {
    externalId: `greenhouse-${org}-${job.id}`,
    title: job.title ?? 'Untitled role',
    company: job.company_name ?? titleCase(org),
    location: job.location?.name,
    url: job.absolute_url ?? '',
    description: job.content,
    postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
    remote: looksRemote(job.location?.name),
    source: 'greenhouse',
  }
}

export function leverListing(job: LeverJob, org: string): JobListing {
  return {
    externalId: `lever-${org}-${job.id}`,
    title: job.text ?? 'Untitled role',
    company: titleCase(org),
    location: job.categories?.location,
    url: job.hostedUrl ?? '',
    description: job.descriptionPlain ?? job.description,
    postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
    remote: job.workplaceType === 'remote' || looksRemote(job.categories?.location),
    source: 'lever',
  }
}

export function ashbyListing(job: AshbyJob, org: string): JobListing {
  return {
    externalId: `ashby-${org}-${job.id}`,
    title: job.title ?? 'Untitled role',
    company: job.organizationName ?? titleCase(org),
    location: job.location,
    url: job.jobUrl ?? '',
    description: job.descriptionPlain,
    postedAt: job.publishedAt ? new Date(job.publishedAt) : undefined,
    remote: job.isRemote === true || looksRemote(job.location),
    source: 'ashby',
  }
}

/** The user-facing name each board is named by in errors. */
export const BOARD_LABELS: Record<CompanyBoard, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
}

/**
 * The three public API roots, written once. Greenhouse and Lever hang the
 * single-job route off these; Ashby has no such route, so its board URL is the
 * whole API surface either path gets.
 */
export const greenhouseBoardUrl = (org: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(org)}`
export const leverBoardUrl = (org: string) =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(org)}`
export const ashbyBoardUrl = (org: string) =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`

/**
 * One GET, with the error taxonomy every board call shares: unreachable is
 * retryable, an HTTP error keeps its status (so a caller can tell a retired
 * posting's 404 from an outage's 503), and unparseable JSON is its own fault.
 *
 * Exported because the paste path in `./posting` needs precisely these
 * distinctions and must not invent a second, subtly different set.
 */
export async function fetchBoardJson<T>(
  fetchImpl: typeof fetch,
  board: string,
  token: string,
  url: string,
): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(url)
  } catch (error) {
    throw new AdapterError('Public boards', `${board} board "${token}" is unreachable`, {
      retryable: true,
      cause: error,
    })
  }

  if (!response.ok) {
    throw new AdapterError('Public boards', `${board} board "${token}" returned ${response.status}`, {
      status: response.status,
      retryable: response.status >= 500,
    })
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    throw new AdapterError('Public boards', `${board} board "${token}" returned invalid JSON`, {
      cause: error,
    })
  }
}

/**
 * Client-side filtering. None of these endpoints takes a query parameter worth
 * trusting — Greenhouse and Ashby have none at all, and Remotive's `search` is
 * fuzzy — so the same predicate decides for every board.
 */
function matches(job: JobListing, query: JobQuery): boolean {
  const needle = query.keywords.trim().toLowerCase()
  if (needle) {
    const haystack = `${job.title} ${job.company} ${job.description ?? ''}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }

  const location = query.location?.trim().toLowerCase()
  if (location && !(job.location ?? '').toLowerCase().includes(location)) return false

  if (query.remoteOnly && !job.remote) return false

  return true
}

export class FreeBoardsAdapter implements JobsAdapter {
  readonly id = 'free_boards'
  readonly meta = freeBoardsMeta

  /**
   * The boards that failed during the last search, as user-readable errors. A
   * mistyped or retired board token must not cost the user every other board's
   * results — but it must not vanish silently either.
   */
  readonly errors: AdapterError[] = []

  /**
   * `companies` is the raw setting value. Left undefined it is read from
   * settings on first search, which is how the keyless factory case gets it
   * without having to know this adapter takes configuration.
   */
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly companies?: string,
  ) {}

  async search(query: JobQuery): Promise<JobListing[]> {
    this.errors.length = 0

    const targets = parseBoardTargets(await this.resolveCompanies())
    const sources = [
      this.searchRemotive(query),
      ...targets.map((target) => this.searchCompanyBoard(target, query)),
    ]

    const settled = await Promise.allSettled(sources)
    const listings: JobListing[] = []

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        listings.push(...result.value)
        continue
      }
      const reason: unknown = result.reason
      this.errors.push(
        reason instanceof AdapterError
          ? reason
          : new AdapterError('Public boards', String(reason), { cause: reason }),
      )
    }

    // Every source failing is an outage, not degradation. Returning [] there
    // would read to the user as "no jobs match", which is a lie.
    if (this.errors.length === settled.length) throw this.errors[0]

    return listings
  }

  private async resolveCompanies(): Promise<string> {
    if (this.companies !== undefined) return this.companies
    // Imported lazily: the registry imports this module for `freeBoardsMeta`,
    // so a static import would be a cycle, and it keeps the settings store (and
    // its Prisma client) out of the graph when a caller injects the setting.
    const [{ settingKey }, { readSetting }] = await Promise.all([
      import('@/lib/providers/registry'),
      import('@/lib/settings/store'),
    ])
    return (await readSetting(settingKey(this.id, 'companies'))) ?? ''
  }

  private fetchJson<T>(board: string, token: string, url: string): Promise<T> {
    return fetchBoardJson<T>(this.fetchImpl, board, token, url)
  }

  private async searchRemotive(query: JobQuery): Promise<JobListing[]> {
    const params = new URLSearchParams({ search: query.keywords, limit: '25' })
    const body = await this.fetchJson<RemotiveResponse>(
      'Remotive',
      'remotive',
      `${REMOTIVE_API}?${params}`,
    )

    return (body.jobs ?? [])
      .map(
        (job): JobListing => ({
          externalId: `remotive-${job.id}`,
          title: job.title ?? 'Untitled role',
          company: job.company_name ?? 'Unknown',
          location: job.candidate_required_location,
          url: job.url ?? '',
          description: job.description,
          postedAt: job.publication_date ? new Date(job.publication_date) : undefined,
          remote: true,
          source: 'remotive',
        }),
      )
      .filter((job) => matches(job, query))
  }

  private async searchCompanyBoard(
    { board, token }: BoardTarget,
    query: JobQuery,
  ): Promise<JobListing[]> {
    const listings = await this.fetchBoard(board, token)
    return listings.filter((job) => matches(job, query))
  }

  private fetchBoard(board: CompanyBoard, token: string): Promise<JobListing[]> {
    switch (board) {
      case 'greenhouse':
        return this.fetchGreenhouse(token)
      case 'lever':
        return this.fetchLever(token)
      case 'ashby':
        return this.fetchAshby(token)
    }
  }

  private async fetchGreenhouse(token: string): Promise<JobListing[]> {
    const body = await this.fetchJson<GreenhouseResponse>(
      BOARD_LABELS.greenhouse,
      token,
      `${greenhouseBoardUrl(token)}/jobs?content=true`,
    )

    return (body.jobs ?? []).map((job) => greenhouseListing(job, token))
  }

  private async fetchLever(token: string): Promise<JobListing[]> {
    const body = await this.fetchJson<LeverResponse>(
      BOARD_LABELS.lever,
      token,
      `${leverBoardUrl(token)}?mode=json`,
    )

    return (Array.isArray(body) ? body : []).map((job) => leverListing(job, token))
  }

  private async fetchAshby(token: string): Promise<JobListing[]> {
    const body = await this.fetchJson<AshbyResponse>(
      BOARD_LABELS.ashby,
      token,
      ashbyBoardUrl(token),
    )

    return (body.jobs ?? []).map((job) => ashbyListing(job, token))
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return probe('Public boards', () => this.fetchImpl(`${REMOTIVE_API}?limit=1`))
  }
}
