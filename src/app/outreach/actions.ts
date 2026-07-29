'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/db/client'
import { draftOutreach } from '@/lib/outreach/draft'
import { EmailNotConfiguredError, markSentManually, sendStep } from '@/lib/outreach/send'
import { markReplied, updateStep } from '@/lib/outreach/sequence'
import type { OutreachCitation } from '@/lib/outreach/types'
import { versionContent } from '@/lib/resume/store'

/**
 * Every mutation the composer can make.
 *
 * Three rules hold across all of them.
 *
 * **Nothing throws at the user.** Actions return `{ error }` and the editor
 * renders it in place; a failed send must never lose the message in the box.
 * The one error that gets special handling is `EmailNotConfiguredError`, which
 * already carries the provider's registry `degradation` copy — the same
 * sentence Settings shows — so the missing key reads as a product state with a
 * fallback rather than as a failure.
 *
 * **Every write revalidates all three surfaces that count outreach:** the
 * screen, the dashboard's follow-ups panel, and the application's timeline.
 * They all read `dueSteps`, so leaving one stale would show the user two
 * different answers to "who is waiting on me?".
 *
 * **Regenerate is not a write.** It asks the model and hands the draft back;
 * what is on disk changes when the user says Save draft or Send now. That is
 * also why its citations are returned rather than stored — `Outreach` has no
 * citations column and the schema is frozen this wave (see `message-editor`).
 */

export interface ActionResult {
  error?: string
  /**
   * Something true worth saying that is not a failure — "that step already went
   * out". Kept apart from `error` so the UI does not paint a normal outcome red.
   */
  note?: string
}

export interface DraftResult extends ActionResult {
  subject?: string
  body?: string
  citations?: OutreachCitation[]
}

/** Adapter and model failures are shown verbatim — "402, over plan limit" is actionable. */
function describe(error: unknown): string {
  if (error instanceof EmailNotConfiguredError) return error.degradation
  return error instanceof Error ? error.message : 'Something failed. Try again.'
}

function revalidateOutreach(applicationId?: string): void {
  revalidatePath('/outreach')
  revalidatePath('/')
  if (applicationId) revalidatePath(`/applications/${applicationId}`)
}

/** The step, or the reason there is nothing to act on. */
async function loadStep(stepId: string) {
  return prisma.outreach.findUnique({
    where: { id: stepId },
    select: { id: true, applicationId: true },
  })
}

const GONE = 'That step is no longer here. Reload the screen.'

/**
 * Send this step now.
 *
 * `sendStep` claims the row before the wire and stamps it from the adapter's
 * own result, and the revalidate below is what makes the timeline say "sent" on
 * the very next render — the e2e gate reads exactly that.
 *
 * Every path revalidates, failures included: a send that threw may still have
 * written its claim, and the surfaces have to show that rather than keep
 * offering a Send button for a message that might already be in an inbox.
 */
export async function sendStepAction(
  stepId: string,
  options: { confirmResend?: boolean } = {},
): Promise<ActionResult> {
  const step = await loadStep(stepId)
  if (!step) return { error: GONE }

  let outcome
  try {
    ;({ outcome } = await sendStep(stepId, { confirmResend: options.confirmResend }))
  } catch (error) {
    revalidateOutreach(step.applicationId)
    return { error: describe(error) }
  }

  revalidateOutreach(step.applicationId)
  if (outcome === 'sent') return {}
  if (outcome === 'already-sent') return { note: 'That step already went out — nothing sent again.' }
  return { error: UNCONFIRMED }
}

/** What a step claimed by an attempt nobody heard back from has to say. */
const UNCONFIRMED =
  'An earlier attempt on this step was never confirmed, so it may already have reached them. ' +
  'Check your sent mail: mark it sent if it went out, or send it again if it did not.'

/** Save the edits in the box. `dayOffset` shifts every later step, by design. */
export async function saveDraftAction(
  stepId: string,
  patch: { subject?: string; body?: string; dayOffset?: number },
): Promise<ActionResult> {
  const step = await loadStep(stepId)
  if (!step) return { error: GONE }

  try {
    await updateStep(stepId, patch)
  } catch (error) {
    return { error: describe(error) }
  }

  revalidateOutreach(step.applicationId)
  return {}
}

/**
 * Ask the model for another draft of this step against the role and the user's
 * own résumé. Read-only: the draft comes back to the editor, and the citations
 * that survived `draftOutreach`'s resolve check come with it.
 */
export async function regenerateAction(stepId: string): Promise<DraftResult> {
  const step = await prisma.outreach.findUnique({
    where: { id: stepId },
    include: {
      contact: true,
      application: { include: { job: true, resumeVersion: true } },
    },
  })
  if (!step) return { error: GONE }
  if (!step.contact) {
    return { error: 'This sequence has no contact. Add the human you are writing to first.' }
  }

  // The pinned version is the one this application actually uses. With nothing
  // pinned yet, the newest résumé is the honest stand-in — and the citations it
  // produces name which lines the claims came from either way.
  const version =
    step.application.resumeVersion ??
    (await prisma.resumeVersion.findFirst({ orderBy: { createdAt: 'desc' } }))
  if (!version) {
    return {
      error:
        'No résumé to draft from yet. Import or create one under Résumés — every claim in an ' +
        'outreach message has to come from it.',
    }
  }

  const { job } = step.application

  try {
    const draft = await draftOutreach({
      content: versionContent(version),
      job: { title: job.title, company: job.company, jdText: job.jdText },
      contact: {
        name: step.contact.name,
        title: step.contact.title,
        company: step.contact.company ?? job.company,
      },
    })

    return { subject: draft.subject, body: draft.body, citations: draft.citations }
  } catch (error) {
    return { error: describe(error) }
  }
}

/**
 * The other half of the no-email-key degrade: the user pasted the message into
 * their own client, so the step is history. `markSentManually` leaves
 * `threadRef` null — there is no provider id, and inventing one would make
 * reply detection believe it can match a thread it never saw.
 */
export async function markSentManuallyAction(stepId: string): Promise<ActionResult> {
  const step = await loadStep(stepId)
  if (!step) return { error: GONE }

  try {
    await markSentManually(stepId)
  } catch (error) {
    return { error: describe(error) }
  }

  revalidateOutreach(step.applicationId)
  return {}
}

/**
 * They answered. Halts the rest of the sequence and moves the application to
 * `replied` — both through the engine, which is the only place that stamps
 * milestones.
 */
export async function markRepliedAction(stepId: string): Promise<ActionResult> {
  const step = await loadStep(stepId)
  if (!step) return { error: GONE }

  try {
    await markReplied(stepId)
  } catch (error) {
    return { error: describe(error) }
  }

  revalidateOutreach(step.applicationId)
  return {}
}
