'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { AdapterError } from '@/lib/adapters/types'
import { createManualJob, ingestJobUrl } from '@/lib/jobs/ingest'
import { createApplication, transitionApplication } from '@/lib/pipeline/status'

/**
 * Pipeline mutations. Each one ends the same way: revalidate the board, then
 * send the user to it, so "did that work?" is answered by the board itself
 * rather than a toast.
 */

export interface MutationResult {
  error?: string
}

/** Adapter failures are shown verbatim — the user can act on "402, over plan limit". */
function describe(error: unknown): string {
  if (error instanceof AdapterError) return error.message
  return error instanceof Error ? error.message : 'Something failed. Try again.'
}

export async function ingestJobAction(url: string): Promise<MutationResult> {
  const trimmed = url.trim()
  if (!trimmed) return { error: 'Paste the link to a job posting.' }

  try {
    new URL(trimmed)
  } catch {
    return { error: `“${trimmed}” is not a URL. Paste the full link, or add the job manually.` }
  }

  try {
    const job = await ingestJobUrl(trimmed)
    await createApplication(job.id)
  } catch (error) {
    return { error: describe(error) }
  }

  revalidatePath('/pipeline')
  revalidatePath('/')
  // Back to the board, not into the new application: the card landing in
  // Sourced is the confirmation, and it keeps the "paste five links" rhythm.
  redirect('/pipeline')
}

export async function createManualJobAction(input: {
  title: string
  company: string
  location?: string
  jdText?: string
  url?: string
}): Promise<MutationResult> {
  try {
    const job = await createManualJob(input)
    await createApplication(job.id)
  } catch (error) {
    return { error: describe(error) }
  }

  revalidatePath('/pipeline')
  revalidatePath('/')
  redirect('/pipeline')
}

/** Used by the board's drag-and-drop; the detail page posts a form instead. */
export async function transitionApplicationAction(
  applicationId: string,
  status: string,
): Promise<MutationResult> {
  try {
    await transitionApplication(applicationId, status)
  } catch (error) {
    return { error: describe(error) }
  }

  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/applications/${applicationId}`)
  return {}
}
