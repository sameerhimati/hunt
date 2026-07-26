import type { Application, Job } from '@/generated/prisma/client'
import { prisma } from '@/lib/db/client'
import type { FitRating } from '@/lib/fit/rate'
import { createApplication } from '@/lib/pipeline/status'

import type { JobListing } from './types'

/**
 * A board result is a summary, not a job description. When the adapter returned
 * no body we say so and name the source, rather than shipping an empty `jdText`
 * that later reads as "we scraped this and it was blank" — or, worse, inventing
 * one. Tailoring can re-scrape the URL when the user gets that far.
 */
function jdFor(listing: JobListing): string {
  const description = listing.description?.trim()
  if (description) return description

  return (
    `No description was returned by ${listing.source} for this listing. ` +
    `Open ${listing.url} for the full posting.`
  )
}

/**
 * Pull-in — the one click that turns a search result into a pipeline row.
 *
 * Idempotent on the listing's URL, which is `Job.url`'s unique key: pulling the
 * same posting in from a second run (or a second adapter that surfaced it) is
 * something users do, not an error to throw at them, and it must not deal a
 * duplicate card. `createApplication` is find-or-create for the same reason.
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
  const data = {
    url: listing.url,
    title: listing.title,
    company: listing.company,
    location: listing.location ?? null,
    jdText: jdFor(listing),
    source: 'api',
    scrapedAt: new Date(),
  }

  const job = await prisma.job.upsert({
    where: { url: listing.url },
    create: data,
    update: data,
  })

  const application = await createApplication(job.id)

  if (!rating) return { job, application }

  const rated = await prisma.application.update({
    where: { id: application.id },
    data: { fitTier: rating.tier, fitReasons: JSON.stringify(rating.reasons) },
  })

  return { job, application: rated }
}
