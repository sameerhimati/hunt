import type { CompanyBoard } from './boards'

/**
 * Does this pasted link belong to a board whose JSON we can just ask for?
 *
 * Two thirds of the postings people actually paste live on Ashby, Greenhouse or
 * Lever, and all three publish the posting as canonical structured JSON with no
 * credential. Recognising the URL is the whole difference between "paste a link,
 * get a job" and "buy a scraping key first" — so this parser is deliberately
 * conservative: it returns a reference **only** when every part needed to call
 * the API is present in the URL. Anything else is `null`, which the caller reads
 * as "not our business" and hands to the scraper, unchanged. A wrong match would
 * be worse than no match: it would replace a working scrape with a 404.
 *
 * It does not reuse `canonicalPostingUrl`'s internals from `lib/sourcing`.
 * That module reaches the adapter registry, and importing it here would close a
 * cycle (sourcing → factory → boards → sourcing) for four lines of `new URL`.
 */

export interface BoardPostingRef {
  board: CompanyBoard
  /** The board token — the company's slug on that ATS, case preserved. */
  org: string
  /** Greenhouse uses a numeric id; Lever and Ashby use a UUID. */
  jobId: string
}

/** Hosts that are *only* ever a Greenhouse board, current and legacy alike. */
const GREENHOUSE_HOSTS = new Set([
  'job-boards.greenhouse.io',
  'boards.greenhouse.io',
  'job-boards.eu.greenhouse.io',
  'boards.eu.greenhouse.io',
])

function segments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/**
 * Greenhouse writes one posting three ways, and all three are in the wild:
 * `/{org}/jobs/{id}` on either host, `/{org}?gh_jid={id}` on a board landing
 * page, and `/embed/job_app?for={org}&token={id}` from the embed snippet.
 *
 * The fourth form — `gh_jid` on a company's *own* careers page — is refused on
 * purpose. The id is there but the board token never is, and guessing it from
 * the hostname would 404 far more often than it hit.
 */
function greenhouseRef(url: URL): BoardPostingRef | null {
  const parts = segments(url.pathname)
  const query = url.searchParams

  if (parts[0] === 'embed') {
    const org = query.get('for')
    const jobId = query.get('token')
    return org && jobId ? { board: 'greenhouse', org, jobId } : null
  }

  const org = parts[0]
  if (!org) return null

  const jobId = parts[1] === 'jobs' && parts[2] ? parts[2] : (query.get('gh_jid') ?? '')
  return jobId ? { board: 'greenhouse', org, jobId } : null
}

/**
 * Lever and Ashby share a shape: `/{org}/{id}`, sometimes with a trailing step
 * (`/apply`, `/application`) when the link was copied from inside the flow.
 * Both extra segments are dropped — they point at the same posting.
 */
function slugPairRef(board: CompanyBoard, url: URL): BoardPostingRef | null {
  const [org, jobId] = segments(url.pathname)
  return org && jobId ? { board, org, jobId } : null
}

export function parseBoardPostingUrl(raw: string | null | undefined): BoardPostingRef | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  const host = url.host.toLowerCase().replace(/^www\./, '')

  if (GREENHOUSE_HOSTS.has(host)) return greenhouseRef(url)
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') return slugPairRef('lever', url)
  if (host === 'jobs.ashbyhq.com') return slugPairRef('ashby', url)

  return null
}
