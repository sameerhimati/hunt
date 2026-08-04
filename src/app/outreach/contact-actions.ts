'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { PersonHit } from '@/lib/adapters/people/types'
import { AdapterError } from '@/lib/adapters/types'
import { findContactsFor } from '@/lib/contacts/find'
import { deleteContact, saveContact } from '@/lib/contacts/store'
import { prisma } from '@/lib/db/client'
import { CONTACT_SOURCES } from '@/lib/db/enums'
import {
  buildSequenceSteps,
  draftOutreach,
  OutreachUnavailableError,
  templateSequenceSteps,
  type OutreachContact,
  type OutreachJob,
} from '@/lib/outreach/draft'
import { createSequence, sequenceSteps } from '@/lib/outreach/sequence'
import { TEMPLATE_DRAFT, type ContactView, type SequenceStepInput } from '@/lib/outreach/types'
import type { ResumeContent } from '@/lib/resume/schema'
import { versionContent } from '@/lib/resume/store'

/**
 * The mutations behind the Contacts card — add a human, find one, draft to one.
 *
 * Everything here is written so the keyless floor holds. A user with no Apollo
 * key types the recruiter in by hand; a user with no model key still gets a
 * real sequence (`templateSequenceSteps`) instead of an error dialog. Drafting
 * is the last place in the product that should hard-fail: the human is already
 * looking at a name and a send button.
 *
 * The floor is not a disguise, though. A template that arrives looking like a
 * model draft is hunt asserting authorship it does not have, so the redirect
 * carries `TEMPLATE_DRAFT` and the composer says whose words these are.
 *
 * Failures come back as `{ error }` rather than thrown, because these are
 * called from the application page and a throw there takes the whole hub down.
 * The message is the provider's own words when there is one — "Apollo: over
 * plan limit" is actionable, "Something went wrong" is not.
 */

export interface ContactMutationResult {
  error?: string
  contact?: ContactView
}

/** Past this, a person has stopped believing their click registered. */
const SLOW_ACTION_MS = 1_000

/**
 * How long a contact mutation really took, logged when it crosses that line.
 *
 * The phase-8 golden path flaked once on a cold machine, with Save disabled and
 * nothing on screen to say why. The explanation on record was routes still
 * compiling, and that cannot be it: the gates run `next start` against a
 * production build, which has no on-demand compilation. What a cold gate server
 * *does* have is an empty data directory — and the schema migrates itself on the
 * first query (`src/lib/db/migrate.ts`) behind a lazily constructed client, once
 * per boot, which is the shape of a seconds-long first action and nothing after.
 *
 * That is a candidate, not a conclusion, which is exactly why this measures
 * instead of asserting. No timeout was raised and nothing is retried: the next
 * slow run names the action and the number (docs/reviews/wave-2.md §3).
 */
async function timed<T>(action: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    return await run()
  } finally {
    const durationMs = Date.now() - started
    if (durationMs >= SLOW_ACTION_MS) {
      console.warn(`[contacts] ${action} took ${durationMs}ms, past ${SLOW_ACTION_MS}ms`)
    }
  }
}

export interface ContactLookupPayload {
  hits: PersonHit[]
  /** Non-null when there is something to say about an empty result. */
  reason: string | null
  error?: string
}

/** What the card prints under the draft button, so nobody guesses what got cited. */
export interface DraftResumeNotice {
  pinned: boolean
  resumeName: string | null
  label: string | null
}

function describe(error: unknown): string {
  if (error instanceof AdapterError) return error.message
  return error instanceof Error ? error.message : 'Something failed. Try again.'
}

/**
 * Contacts show up on the application hub, in the outreach queue and in the
 * dashboard's follow-ups count. All three are revalidated together so none of
 * them can show a person the others don't know about.
 */
function revalidateContacts(applicationId: string): void {
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/outreach')
  revalidatePath('/')
}

/**
 * Adapters name themselves freely (`fake-apollo` from the fixture twin, and
 * Phase 6 will send `linkedin-cookie`), but `Contact.source` drives a badge and
 * has a closed vocabulary. Map into it here rather than letting the store throw
 * at the user for a string they never typed.
 */
function contactSource(raw: string | null | undefined): string {
  const value = raw?.trim().toLowerCase() ?? ''
  if (!value) return 'manual'
  if ((CONTACT_SOURCES as readonly string[]).includes(value)) return value
  if (value.includes('linkedin')) return 'linkedin'
  if (value.includes('brightdata')) return 'brightdata'
  if (value.includes('apollo')) return 'apollo'
  return 'manual'
}

export interface SaveContactActionInput {
  applicationId: string
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  linkedinUrl?: string | null
  source?: string | null
}

export async function saveContactAction(
  input: SaveContactActionInput,
): Promise<ContactMutationResult> {
  const name = input.name?.trim()
  if (!name) return { error: 'A contact needs a name — even just a first name.' }

  let contact: ContactView
  try {
    contact = await timed('save', () =>
      saveContact({
        applicationId: input.applicationId,
        name,
        title: input.title,
        company: input.company,
        email: input.email,
        linkedinUrl: input.linkedinUrl,
        source: contactSource(input.source),
      }),
    )
  } catch (error) {
    return { error: describe(error) }
  }

  revalidateContacts(input.applicationId)
  return { contact }
}

export async function deleteContactAction(contactId: string): Promise<ContactMutationResult> {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { applicationId: true },
    })
    // Already gone is the outcome the user asked for, not an error to report.
    if (!contact) return {}

    await timed('delete', () => deleteContact(contactId))
    if (contact.applicationId) revalidateContacts(contact.applicationId)
  } catch (error) {
    return { error: describe(error) }
  }

  return {}
}

/**
 * Look the company up. `findContactsFor` already folds "no key" and adapter
 * failures into a `reason`, so this only has to catch the genuinely unexpected.
 */
export async function findContactsAction(applicationId: string): Promise<ContactLookupPayload> {
  try {
    return await timed('find', () => findContactsFor(applicationId))
  } catch (error) {
    return { hits: [], reason: null, error: describe(error) }
  }
}

/** The résumé a draft will cite, and whether the user actually chose it. */
interface DraftSource {
  content: ResumeContent
  resumeName: string
  label: string
  pinned: boolean
}

/**
 * A version whose stored JSON no longer parses is not worth taking the draft
 * down for — the sequence falls back to the template, and the résumé editor is
 * where a corrupt version gets diagnosed.
 */
function safeContent(version: { content: string }): ResumeContent | null {
  try {
    return versionContent(version)
  } catch {
    return null
  }
}

/**
 * What the draft cites: the version pinned to this application, else the most
 * recent version of the most recently touched résumé. The fallback is never
 * silent — `draftResumeNotice` puts it on screen beside the button, because a
 * cold email citing the wrong résumé is exactly the provenance failure the
 * whole product is built against.
 */
async function resolveDraftSource(applicationId: string): Promise<DraftSource | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { resumeVersion: { include: { resume: true } } },
  })

  const pinned = application?.resumeVersion
  if (pinned) {
    const content = safeContent(pinned)
    if (content) {
      return { content, resumeName: pinned.resume.name, label: pinned.label, pinned: true }
    }
  }

  // Archived résumés are excluded here but not above: a pinned version stays
  // readable forever, because the application really was sent from it. This is
  // the *fallback* — picking a document the user has put away to write a cold
  // email they haven't reviewed is the wrong guess.
  const resume = await prisma.resume.findFirst({
    where: { archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })
  const latest = resume?.versions[0]
  if (!resume || !latest) return null

  const content = safeContent(latest)
  return content ? { content, resumeName: resume.name, label: latest.label, pinned: false } : null
}

export async function draftResumeNotice(applicationId: string): Promise<DraftResumeNotice> {
  const source = await resolveDraftSource(applicationId)
  if (!source) return { pinned: false, resumeName: null, label: null }
  // Deliberately drops the content: the card needs the provenance, not the CV.
  return { pinned: source.pinned, resumeName: source.resumeName, label: source.label }
}

/**
 * Step 1 from the model when there is one, from the template when there isn't.
 * `OutreachUnavailableError` means "no key", which is a supported way to run
 * hunt — every other failure is real news and travels back to the card.
 *
 * The template is a floor, not a forgery, so it carries a receipt: `keyless`
 * says the model was *asked and absent*. Handing three finished-looking
 * messages to someone who believes a model wrote them is the one output this
 * product must not produce silently.
 *
 * It is deliberately false for the no-résumé template. Nothing was asked of a
 * model there, so nothing is known about one — and the contact card has already
 * said "No résumé yet — the draft will be a template you fill in."
 */
async function stepsFor(
  content: ResumeContent | null,
  job: OutreachJob,
  contact: OutreachContact,
): Promise<{ steps: SequenceStepInput[]; keyless: boolean }> {
  if (!content) return { steps: templateSequenceSteps({ job, contact }), keyless: false }

  try {
    const draft = await draftOutreach({ content, job, contact })
    return { steps: buildSequenceSteps(draft, { job, contact }), keyless: false }
  } catch (error) {
    if (error instanceof OutreachUnavailableError) {
      return { steps: templateSequenceSteps({ job, contact }), keyless: true }
    }
    throw error
  }
}

/**
 * Draft a sequence to this contact and open the composer on it.
 *
 * Re-running on a contact who already has a sequence opens it rather than
 * dealing a second one — a double click must not schedule two intros at the
 * same human.
 */
export async function draftOutreachAction(
  applicationId: string,
  contactId: string,
): Promise<ContactMutationResult> {
  /** Whether the sequence this call dealt came from the template for want of a model. */
  let keyless = false

  try {
    const [application, contact] = await Promise.all([
      prisma.application.findUnique({ where: { id: applicationId }, include: { job: true } }),
      prisma.contact.findUnique({ where: { id: contactId } }),
    ])
    if (!application || !contact) {
      return { error: 'That contact is no longer on this application.' }
    }

    const existing = await sequenceSteps({ applicationId, contactId })
    if (existing.length === 0) {
      const source = await resolveDraftSource(applicationId)
      const drafted = await stepsFor(
        source?.content ?? null,
        {
          title: application.job.title,
          company: application.job.company,
          jdText: application.job.jdText,
        },
        { name: contact.name, title: contact.title, company: contact.company },
      )
      await createSequence({ applicationId, contactId, steps: drafted.steps })
      keyless = drafted.keyless
    }
  } catch (error) {
    return { error: describe(error) }
  }

  revalidateContacts(applicationId)
  // Straight into the composer with the sequence already written — the answer
  // to "did that work?" is the drafted message, not a toast. The marker travels
  // with it so the composer can say whose words those are.
  const marker = keyless ? `&${TEMPLATE_DRAFT.param}=${TEMPLATE_DRAFT.value}` : ''
  redirect(`/outreach?contact=${contactId}${marker}`)
}
