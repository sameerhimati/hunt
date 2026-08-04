'use server'

import { revalidatePath } from 'next/cache'

import { completeOnboarding } from '@/lib/onboarding/state'
import { createResumeFromImport } from '@/app/resumes/actions'
import { parseResumeContent } from '@/lib/resume/schema'
import { createResume } from '@/lib/resume/store'
import type { ResumeContent } from '@/lib/resume/schema'

/**
 * Server actions for the first-run wizard.
 *
 * Key saving and connection testing are *not* here: `saveProvider` and
 * `testProviderConnection` in `../settings/actions.ts` already do exactly that,
 * and a second pair that wrote the same rows would be two implementations of
 * "what does a configured provider look like" — the kind of drift where the
 * wizard says a key is saved and Settings disagrees.
 */

/**
 * Create the résumé from inside the wizard, without leaving it.
 *
 * `createResumeFromImport` redirects into the résumé editor, which is right when
 * the user chose Import from the résumé screen and wrong here — it would drop
 * them out of a half-finished first run. Same store call, no redirect.
 */
export async function importResumeInOnboarding(input: {
  name: string
  content: unknown
  text?: string
  kind?: string
}): Promise<{ resumeId: string }> {
  const content: ResumeContent = parseResumeContent(input.content)

  const resume = await createResume(input.name.trim() || 'Imported résumé', content, {
    sourceText: input.text?.trim() ? input.text : undefined,
    sourceKind: input.kind,
  })

  revalidatePath('/resumes')
  return { resumeId: resume.id }
}

/**
 * Mark the wizard done.
 *
 * Takes no view on what the user actually did: skipping every key and importing
 * nothing is a completed first run, because every step is optional and a wizard
 * that refused to end would be a login screen wearing a different hat. The
 * dashboard's empty states pick up whatever is still missing.
 */
export async function finishOnboarding(): Promise<void> {
  await completeOnboarding()
  revalidatePath('/')
}

export { createResumeFromImport }
