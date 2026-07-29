import { AdapterError } from '../types'

import type { BoardPostingRef } from './board-urls'
import {
  ashbyBoardUrl,
  ashbyListing,
  BOARD_LABELS,
  fetchBoardJson,
  greenhouseBoardUrl,
  greenhouseListing,
  leverBoardUrl,
  leverListing,
  type AshbyResponse,
  type GreenhouseJob,
  type LeverJob,
} from './boards'
import type { JobListing } from './types'

/**
 * One posting, fetched from the board that published it — no key, no scrape.
 *
 * The three boards are not one shape and pretending they were is how this goes
 * wrong:
 *
 *  - **Greenhouse** and **Lever** each have a real single-job route, but their
 *    envelopes differ from the list ones: both return the job *bare* rather than
 *    wrapped, and Greenhouse's single-job response carries `content` without the
 *    `?content=true` the list call needs.
 *  - **Ashby has no single-job route at all.** You fetch the org's whole board
 *    and find the posting in it. That is the dominant case in practice — most
 *    pasted board links are Ashby — so it is the design centre here, not the
 *    exception: the Ashby branch is allowed to be the expensive one, and "this
 *    posting is gone" arrives there as an absence from a 200, never as a 404.
 *
 * All three funnel into `fetchBoardJson` and the exported mappers, so a listing
 * pulled from a pasted URL is indistinguishable from the same listing found by
 * search — same `externalId`, same canonical `url`, one pipeline row.
 */

/**
 * A posting that no longer exists, told apart from an outage.
 *
 * Boards pull postings constantly, and a 404 on a *single job* means the role
 * was taken down, not that the board is broken — so it must never be retried and
 * must never fall back to scraping, which would silently write a worse record
 * (a 404 page's markdown) under a real-looking title. Non-retryable by
 * construction: there is nothing to come back to.
 */
export class PostingGoneError extends AdapterError {
  constructor(board: string, url: string) {
    super(
      board,
      `this posting is no longer listed — it was taken down, or the link is wrong. ` +
        `Open ${url} to check, or add the job manually to keep it.`,
      { status: 404 },
    )
    this.name = 'PostingGoneError'
  }
}

function isGone(error: unknown): boolean {
  return error instanceof AdapterError && error.status === 404
}

export async function fetchBoardPosting(
  ref: BoardPostingRef,
  fetchImpl: typeof fetch = fetch,
): Promise<JobListing> {
  const label = BOARD_LABELS[ref.board]

  try {
    switch (ref.board) {
      case 'greenhouse': {
        const job = await fetchBoardJson<GreenhouseJob>(
          fetchImpl,
          label,
          ref.org,
          `${greenhouseBoardUrl(ref.org)}/jobs/${encodeURIComponent(ref.jobId)}`,
        )
        return greenhouseListing(job, ref.org)
      }
      case 'lever': {
        const job = await fetchBoardJson<LeverJob>(
          fetchImpl,
          label,
          ref.org,
          `${leverBoardUrl(ref.org)}/${encodeURIComponent(ref.jobId)}`,
        )
        return leverListing(job, ref.org)
      }
      case 'ashby': {
        const body = await fetchBoardJson<AshbyResponse>(
          fetchImpl,
          label,
          ref.org,
          ashbyBoardUrl(ref.org),
        )
        // The board is the only endpoint, so "gone" is an absence from a 200.
        // Ids are compared case-insensitively: the same UUID is written both
        // ways across Ashby's own links.
        const wanted = ref.jobId.toLowerCase()
        const job = (body.jobs ?? []).find((entry) => entry.id?.toLowerCase() === wanted)
        if (!job) throw new PostingGoneError(label, postingSourceUrl(ref))
        return ashbyListing(job, ref.org)
      }
    }
  } catch (error) {
    // A 404 on one posting is a retired role; 5xx, timeouts and bad JSON keep
    // their own, retryable, provider-named message.
    if (error instanceof PostingGoneError) throw error
    if (isGone(error)) throw new PostingGoneError(label, postingSourceUrl(ref))
    throw error
  }
}

/** The human-facing board link for a ref — what to open to see for yourself. */
function postingSourceUrl(ref: BoardPostingRef): string {
  switch (ref.board) {
    case 'greenhouse':
      return `https://job-boards.greenhouse.io/${ref.org}/jobs/${ref.jobId}`
    case 'lever':
      return `https://jobs.lever.co/${ref.org}/${ref.jobId}`
    case 'ashby':
      return `https://jobs.ashbyhq.com/${ref.org}/${ref.jobId}`
  }
}
