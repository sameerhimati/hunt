'use server'

import { revalidatePath } from 'next/cache'

import { prisma } from '@/lib/db/client'
import { applicationDetail } from '@/lib/pipeline/board'
import { transitionApplication } from '@/lib/pipeline/status'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'
import { getVersion, saveVersion, versionContent } from '@/lib/resume/store'
import { applyChangesWithReport, type SkippedChange } from '@/lib/tailor/apply'
import {
  draftCoverLetter,
  loadCoverLetter,
  saveCoverLetter,
  type CoverLetterDraft,
} from '@/lib/tailor/cover-letter'
import { runTailor } from '@/lib/tailor/engine'
import type { FitJob, TailorChange, TailorRun } from '@/lib/tailor/types'

/**
 * Server actions for the tailoring screen.
 *
 * Deliberately **not** `app/applications/[id]/actions.ts`: the application hub
 * is a Wave-1 seam and Phase 4 needs that filename. Tailoring is a sibling
 * route, so it brings its own.
 *
 * Every action returns a result union rather than throwing. Next redacts thrown
 * server-action messages in production, and TAILORING-DIFF §8 asks for the real
 * reason inline with a retry — an opaque "an error occurred" would be exactly
 * the error voice the product forbids.
 */

export type TailorRunResult = { ok: true; run: TailorRun } | { ok: false; error: string }

function reason(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

async function jobFor(applicationId: string): Promise<
  { ok: true; job: FitJob; status: string } | { ok: false; error: string }
> {
  const application = await applicationDetail(applicationId)
  if (!application) return { ok: false, error: 'That application no longer exists.' }

  return {
    ok: true,
    status: application.status,
    job: {
      title: application.job.title,
      company: application.job.company,
      jdText: application.job.jdText ?? '',
    },
  }
}

/**
 * One tailor run against one base version. Returns the whole `TailorRun` —
 * refusals included, in the order the model made them. Filtering them out here
 * would hide what was attempted, which is the one thing the review screen
 * exists to show.
 */
export async function runTailorAction(
  applicationId: string,
  baseVersionId: string,
): Promise<TailorRunResult> {
  try {
    const context = await jobFor(applicationId)
    if (!context.ok) return context

    const version = await getVersion(baseVersionId)
    if (!version) return { ok: false, error: 'That résumé version no longer exists.' }

    // No key check here: `runTailor` resolves the model itself and throws
    // `TailorUnavailableError` when there is none, which `reason` hands back
    // verbatim. A second check would be a second wording of the same sentence.
    const run = await runTailor({
      content: versionContent(version),
      job: context.job,
      baseVersionId,
    })

    return { ok: true, run }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'The tailor run failed.') }
  }
}

export interface SaveTailoredVersionRequest {
  applicationId: string
  baseVersionId: string
  /** The accepted subset. Refusals are filtered again here, not trusted. */
  accepted: TailorChange[]
  label: string
  templateId?: string | null
  rawLatexOverride?: string | null
  /**
   * The user's own hand-edits from the Structured tab, when they detached the
   * document from the change list. Their résumé, their words — but it means the
   * saved content comes from the client, so it is re-parsed before it lands.
   */
  contentOverride?: ResumeContent | null
}

export type SaveTailoredVersionResult =
  | {
      ok: true
      version: { id: string; label: string; resumeId: string }
      /**
       * Accepted changes the saved document had no place for — empty on the
       * normal save. The caller has to show these: a change the user reviewed
       * and accepted that is not in the version is a difference between the
       * document they approved and the one that was written.
       */
      skipped: SkippedChange[]
    }
  | { ok: false; error: string }

/**
 * Commits the accepted changes as a **child** of the base version and pins it
 * to the application. The base is never touched — it is what the user
 * re-tailors and branches from, and the version tree is the provenance record
 * of what was actually sent.
 */
export async function saveTailoredVersionAction(
  request: SaveTailoredVersionRequest,
): Promise<SaveTailoredVersionResult> {
  try {
    const base = await getVersion(request.baseVersionId)
    if (!base) return { ok: false, error: 'That résumé version no longer exists.' }

    // Defence in depth: a refused change reaching `applyChanges` would be a
    // caller bug, and this is the last place to catch it before it becomes a
    // document. The validator's verdict is authoritative, never the client's.
    const accepted = request.accepted.filter((change) => change.status === 'proposed')

    // The base is read fresh here, so it can have moved since the run — an
    // accepted change may now point at a bullet that is gone. Dropping it is
    // right; dropping it in silence is not, so what did not land travels back
    // with the version rather than dying inside this function.
    const applied = request.contentOverride
      ? { content: parseResumeContent(request.contentOverride), skipped: [] as SkippedChange[] }
      : applyChangesWithReport(versionContent(base), accepted)

    const created = await saveVersion({
      resumeId: base.resumeId,
      parentVersionId: base.id,
      label: request.label.trim() || 'Tailored version',
      content: applied.content,
      templateId: request.templateId ?? base.templateId,
      rawLatexOverride: request.rawLatexOverride ?? null,
    })

    await prisma.application.update({
      where: { id: request.applicationId },
      data: { resumeVersionId: created.id },
    })

    // Tailoring is the move out of `sourced`. Any later status already implies
    // it, so this only ever advances a card that hasn't moved yet.
    const context = await jobFor(request.applicationId)
    if (context.ok && context.status === 'sourced') {
      await transitionApplication(request.applicationId, 'tailored')
    }

    revalidatePath(`/applications/${request.applicationId}`)

    return {
      ok: true,
      version: { id: created.id, label: created.label, resumeId: created.resumeId },
      skipped: applied.skipped,
    }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'Saving the tailored version failed.') }
  }
}

export type CoverLetterResult =
  | { ok: true; draft: CoverLetterDraft | null }
  | { ok: false; error: string }

/** Slot for leaf P3.d — drafts the letter from the version the run produced. */
export async function draftCoverLetterAction(
  applicationId: string,
  versionId: string,
): Promise<CoverLetterResult> {
  try {
    const context = await jobFor(applicationId)
    if (!context.ok) return context

    const version = await getVersion(versionId)
    if (!version) return { ok: false, error: 'That résumé version no longer exists.' }

    const draft = await draftCoverLetter({
      applicationId,
      content: versionContent(version),
      job: context.job,
    })

    return { ok: true, draft }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'Drafting the cover letter failed.') }
  }
}

/** Slot for leaf P3.d — pins the letter to the application beside the résumé. */
export async function saveCoverLetterAction(
  applicationId: string,
  draft: CoverLetterDraft,
): Promise<CoverLetterResult> {
  try {
    const saved = await saveCoverLetter(applicationId, draft)
    revalidatePath(`/applications/${applicationId}`)
    return { ok: true, draft: saved }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'Saving the cover letter failed.') }
  }
}

/** Slot for leaf P3.d — reads back a letter saved on an earlier visit. */
export async function loadCoverLetterAction(applicationId: string): Promise<CoverLetterResult> {
  try {
    return { ok: true, draft: await loadCoverLetter(applicationId) }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'Loading the cover letter failed.') }
  }
}
