import type { Application, Job } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import type { FitRating } from '@/lib/fit/rate'
import { createApplication } from '@/lib/pipeline/status'

import { canonicalPostingUrl } from './search'
import type { JobListing } from './types'

/** The opening words of `jdFor`'s placeholder — the one thing that identifies it. */
const NO_DESCRIPTION = 'No description was returned by'

/**
 * A board result is a summary, not a job description. When the adapter returned
 * no body we say so and name the source, rather than shipping an empty `jdText`
 * that later reads as "we scraped this and it was blank" — or, worse, inventing
 * one. Tailoring can re-scrape the URL when the user gets that far.
 */
function jdFor(listing: JobListing): string {
  const description = listing.description?.trim()
  if (description) return description

  const url = listing.url?.trim()
  const where = url ? ` Open ${url} for the full posting.` : ''
  return `${NO_DESCRIPTION} ${listing.source} for this listing.${where}`
}

function isPlaceholderJd(text: string): boolean {
  return text.trimStart().startsWith(NO_DESCRIPTION)
}

/**
 * `jdText` on a re-pull: information only ever goes up, never down.
 *
 * This field is the input to keyword coverage, the checks panel and tailoring,
 * so replacing a real posting with a thinner one is not a refresh — it is data
 * loss that the downstream screens then quietly report on. Three rules, in
 * order:
 *
 *  1. The placeholder never wins. It is a statement that *no* description
 *     arrived, so by construction it cannot be an improvement on one.
 *  2. Anything beats the placeholder, or an empty body.
 *  3. Otherwise the longer body wins. Crude, but it is the only signal we have
 *     and it is monotone: a board summary can't displace a full scrape, and a
 *     full JD arriving after a stub still gets in.
 */
function refreshedJd(stored: string, incoming: string): string {
  if (isPlaceholderJd(incoming)) return stored.trim() ? stored : incoming
  if (!stored.trim() || isPlaceholderJd(stored)) return incoming

  return incoming.length > stored.length ? incoming : stored
}

/**
 * The row this listing is already, if it is.
 *
 * With a URL that is `Job.url`'s unique index, canonicalised so two spellings
 * of one posting land on one row. Without one there is no unique key at all, so
 * identity falls back to the three fields every board sends. That is narrow
 * enough that two genuinely different postings must share a company, a title
 * *and* a location to be mistaken for each other — and without it every re-pull
 * of a link-less listing deals another card, which is the promise the docstring
 * below makes.
 */
function findExistingJob(url: string | null, listing: JobListing): Promise<Job | null> {
  if (url) return prisma.job.findUnique({ where: { url } })

  return prisma.job.findFirst({
    where: {
      url: null,
      title: listing.title,
      company: listing.company,
      location: listing.location ?? null,
    },
  })
}

/**
 * Pull-in — the one click that turns a search result into a pipeline row.
 *
 * Idempotent on the listing's canonical URL: pulling the same posting in from a
 * second run (or a second adapter that surfaced it) is something users do, not
 * an error to throw at them, and it must not deal a duplicate card.
 * `createApplication` is find-or-create for the same reason.
 *
 * A re-pull is a **partial** refresh, for the same reason `src/lib/jobs/ingest.ts`
 * makes one: `title` and `company` are the two fields the user is invited to
 * correct on the application page, so a later sighting must not replace a
 * correction with a board's second guess. `source` is history — how the row
 * arrived — and a posting the user pasted and scraped did not become an API
 * result because a board later listed it. `scrapedAt` moves only when the body
 * actually did, so it never vouches for text it didn't fetch.
 *
 * The rating travels with the job when one exists, so the tier the user saw on
 * the sourcing board is the tier on the card. Re-rating on the application page
 * would let the same posting read Strong here and Possible there. With no
 * rating both columns stay null — an unrated card says "unrated", and defaulting
 * a tier would be hunt asserting a judgement no model made.
 */
export async function pullIntoPipeline(
  listing: JobListing,
  rating?: FitRating,
): Promise<{ job: Job; application: Application }> {
  const url = canonicalPostingUrl(listing.url)
  const jdText = jdFor(listing)
  const existing = await findExistingJob(url, listing)

  let job: Job
  if (existing) {
    const refreshed = refreshedJd(existing.jdText, jdText)
    job = await prisma.job.update({
      where: { id: existing.id },
      data: {
        // A board that omits the location must not erase one we already know.
        location: listing.location ?? existing.location,
        jdText: refreshed,
        ...(refreshed === existing.jdText ? {} : { scrapedAt: new Date() }),
      },
    })
  } else {
    job = await prisma.job.create({
      data: {
        url,
        title: listing.title,
        company: listing.company,
        location: listing.location ?? null,
        jdText,
        source: 'api',
        scrapedAt: new Date(),
      },
    })
  }

  const application = await createApplication(job.id)

  if (!rating) return { job, application }

  const rated = await prisma.application.update({
    where: { id: application.id },
    data: { fitTier: rating.tier, fitReasons: JSON.stringify(rating.reasons) },
  })

  return { job, application: rated }
}
