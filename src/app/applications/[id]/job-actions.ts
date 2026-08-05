'use server'

import { revalidatePath } from 'next/cache'

import { updateJob } from '@/lib/jobs/ingest'

export interface MutationResult {
  error?: string
}

/**
 * Corrects the posting behind an application.
 *
 * Unlike the pipeline's mutations, this one does not redirect: the user is
 * reading the posting when they notice it is wrong, and the fix should leave
 * them where they were rather than bouncing them to the board. Revalidating
 * both the page and the board is enough — the corrected title is what the card
 * shows next time it renders.
 */
export async function updateJobAction(
  applicationId: string,
  jobId: string,
  input: { title: string; company: string; location?: string; jdText?: string },
): Promise<MutationResult> {
  try {
    await updateJob(jobId, input)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not save the posting.' }
  }

  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/pipeline')
  revalidatePath('/')
  return {}
}
