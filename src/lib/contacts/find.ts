/**
 * "Who do I talk to at this company?" — the adapter-backed half of contacts.
 *
 * The shape of the answer is the design decision: this never throws and never
 * returns bare hits. **No Apollo key is the normal state**, not an error — most
 * users will run hunt keyless for a while, and outreach works fine without it
 * (you type the recruiter in by hand). So the keyless path returns
 * `{ hits: [], reason }` where the reason is Apollo's own `degradation` string,
 * which is what the card prints: what a key would buy, in the provider's words,
 * declared once in its `meta` rather than re-written per screen.
 *
 * `AdapterError` collapses into the same shape for the same reason. Rate limits
 * and 402s are the expected weather of a free tier; a stack trace in the
 * contacts card is a bug, and a thrown error in a server component takes the
 * whole application page down with it. Anything *not* an AdapterError still
 * throws — that would be our bug, and hiding it would be worse.
 *
 * Server-only: it reads Prisma and constructs adapters from stored settings.
 */

import { createAdapter } from '@/lib/adapters/factory'
import { apolloMeta } from '@/lib/adapters/people/apollo'
import type { PeopleAdapter, PersonHit } from '@/lib/adapters/people/types'
import { AdapterError } from '@/lib/adapters/types'
import { prisma } from '@/lib/db/client'

export interface FindContactsOptions {
  titles?: string[]
  limit?: number
  /**
   * Injected by tests and gates. Explicit `null` forces the keyless path;
   * omitted resolves Apollo from settings (a `Fake` twin under HUNT_TEST_MODE).
   */
  adapter?: PeopleAdapter | null
}

/**
 * `reason` is non-null exactly when there is something to tell the user about
 * an empty result — no key, or a provider that answered with a failure.
 */
export interface ContactLookupResult {
  hits: PersonHit[]
  reason: string | null
}

export async function findContactsFor(
  applicationId: string,
  options: FindContactsOptions = {},
): Promise<ContactLookupResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { job: { select: { company: true } } },
  })

  const company = application?.job.company?.trim()
  if (!company) {
    return { hits: [], reason: 'This application has no company name to search on.' }
  }

  const adapter =
    options.adapter !== undefined
      ? options.adapter
      : ((await createAdapter('apollo')) as PeopleAdapter | null)

  if (!adapter) return { hits: [], reason: apolloMeta.degradation }

  try {
    const hits = await adapter.findContacts({
      company,
      titles: options.titles,
      limit: options.limit,
    })
    return { hits, reason: null }
  } catch (error) {
    // Verbatim: the AdapterError message already names the provider and the
    // real reason ("Apollo: over plan limit"), which is what the card shows.
    if (error instanceof AdapterError) return { hits: [], reason: error.message }
    throw error
  }
}
