'use server'

import { runAllChecks } from '@/lib/checks'
import type { CheckOutcome } from '@/lib/checks/types'
import { prisma } from '@/lib/db/client'
import { CHECK_KINDS, type CheckKind, type CheckVerdict } from '@/lib/db/enums'
import { applicationDetail } from '@/lib/pipeline/board'
import { versionContent } from '@/lib/resume/store'

/**
 * Server actions for the checks panel on the application page.
 *
 * Deliberately **not** `app/applications/[id]/actions.ts`: that filename is a
 * Wave-1 seam Phase 4 needs for the contacts/outreach slots, so the checks
 * bring their own file and the two phases never meet in a merge.
 *
 * Both actions return a result union instead of throwing. Next redacts thrown
 * server-action messages in production, and the panel is supposed to print the
 * real reason a check could not run — an opaque "an error occurred" is exactly
 * the error voice DESIGN §8 forbids.
 */

/** The five readings plus what they were taken on. Never an aggregate. */
export interface ChecksSnapshot {
  /** The pinned version the readings describe — null when nothing is pinned yet. */
  version: { id: string; resumeId: string; label: string } | null
  /** Whether this posting actually carries a description for the JD-relative checks. */
  hasJd: boolean
  /** One outcome per kind that has been measured, in `CHECK_KINDS` order. Empty = never run. */
  outcomes: CheckOutcome[]
  /** When the stored readings were taken, ISO. Null when there are none. */
  ranAt: string | null
}

export type ChecksResult = { ok: true; snapshot: ChecksSnapshot } | { ok: false; error: string }

/**
 * What goes in `CheckResult.details`.
 *
 * The column holds "structured specifics as JSON" and the row has no place for
 * a check that *could not measure* to say why — but "not measured, because no
 * model is configured" is the reading in that case, and dropping it on the way
 * to the database would turn a reload into a silent blank card. So the JSON is
 * an envelope: the check's own detail payload, plus the reason when there is
 * one. This module is the only writer and the only reader of that column.
 */
interface StoredDetails {
  details: unknown
  error?: string
}

function reason(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

/** Reads back the last run for the version pinned to this application. */
export async function loadChecksAction(applicationId: string): Promise<ChecksResult> {
  try {
    const application = await applicationDetail(applicationId)
    if (!application) return { ok: false, error: 'That application no longer exists.' }

    const version = application.resumeVersion
    const hasJd = Boolean(application.job.jdText?.trim())

    if (!version) {
      return { ok: true, snapshot: { version: null, hasJd, outcomes: [], ranAt: null } }
    }

    const rows = await prisma.checkResult.findMany({
      where: { resumeVersionId: version.id, jobId: application.jobId },
      orderBy: { createdAt: 'desc' },
    })

    const byKind = new Map<string, (typeof rows)[number]>()
    for (const row of rows) if (!byKind.has(row.kind)) byKind.set(row.kind, row)

    const outcomes: CheckOutcome[] = []
    for (const kind of CHECK_KINDS) {
      const row = byKind.get(kind)
      if (row) outcomes.push(outcomeFromRow(row, kind))
    }

    const ranAt = rows.length > 0 ? rows[0].createdAt.toISOString() : null

    return {
      ok: true,
      snapshot: {
        version: { id: version.id, resumeId: version.resumeId, label: version.label },
        hasJd,
        outcomes,
        ranAt,
      },
    }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'Loading the saved checks failed.') }
  }
}

/**
 * Runs every instrument against the pinned version and stores the readings.
 *
 * One sweep, not five: `runAllChecks` already isolates the checks from each
 * other (a thrown parser, a missing key and an absent JD each degrade to their
 * own `warn` outcome carrying the reason), so a per-card "Run" can trigger this
 * without any card being able to take the others down with it. Splitting it
 * into five entry points would mean a second copy of the registry here, which
 * is precisely what `src/lib/checks/index.ts` exists to prevent.
 */
export async function runChecksAction(applicationId: string): Promise<ChecksResult> {
  try {
    const application = await applicationDetail(applicationId)
    if (!application) return { ok: false, error: 'That application no longer exists.' }

    const version = application.resumeVersion
    const hasJd = Boolean(application.job.jdText?.trim())

    if (!version) {
      return {
        ok: false,
        error:
          'No résumé version is pinned to this application yet, so there is no document to ' +
          'measure. Tailor a résumé to this job and the checks run against exactly what you send.',
      }
    }

    const outcomes = await runAllChecks({
      version: {
        id: version.id,
        content: versionContent(version),
        templateId: version.templateId,
        rawLatexOverride: version.rawLatexOverride,
      },
      job: {
        id: application.jobId,
        title: application.job.title,
        company: application.job.company,
        jdText: application.job.jdText ?? '',
      },
    })

    // Replace rather than append: the panel shows the current reading on the
    // current document, and a growing pile of stale rows for one version/job
    // pair would make "latest" a question rather than a fact.
    await prisma.$transaction([
      prisma.checkResult.deleteMany({
        where: { resumeVersionId: version.id, jobId: application.jobId },
      }),
      prisma.checkResult.createMany({
        data: outcomes.map((outcome) => ({
          resumeVersionId: version.id,
          jobId: application.jobId,
          kind: outcome.kind,
          verdict: outcome.verdict,
          summary: outcome.summary,
          details: encodeDetails(outcome),
        })),
      }),
    ])

    return {
      ok: true,
      snapshot: {
        version: { id: version.id, resumeId: version.resumeId, label: version.label },
        hasJd,
        outcomes,
        ranAt: new Date().toISOString(),
      },
    }
  } catch (cause) {
    return { ok: false, error: reason(cause, 'Running the checks failed.') }
  }
}

function encodeDetails(outcome: CheckOutcome): string {
  const stored: StoredDetails = { details: outcome.details ?? null }
  if (outcome.error) stored.error = outcome.error
  return JSON.stringify(stored)
}

function outcomeFromRow(
  row: { verdict: string; summary: string; details: string },
  kind: CheckKind,
): CheckOutcome {
  const stored = decodeDetails(row.details)

  return {
    kind,
    verdict: row.verdict as CheckVerdict,
    summary: row.summary,
    details: stored.details,
    ...(stored.error ? { error: stored.error } : {}),
  }
}

/**
 * Tolerates a row this module did not write. A corrupt or foreign `details`
 * blob costs the card its specifics, never the whole panel — the count and
 * verdict live in their own columns and stay readable.
 */
function decodeDetails(raw: string): StoredDetails {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'details' in parsed) {
      const envelope = parsed as { details: unknown; error?: unknown }
      return {
        details: envelope.details,
        ...(typeof envelope.error === 'string' ? { error: envelope.error } : {}),
      }
    }
    return { details: parsed }
  } catch {
    return { details: null }
  }
}
