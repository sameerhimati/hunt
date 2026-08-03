import { readSetting, writeSetting } from '@/lib/settings/store'

/**
 * Whether the first-run wizard has been through.
 *
 * **A recorded fact, not an inference.** The tempting version is "no résumé and
 * no applications means they are new", and it is wrong in the direction that
 * hurts: a user who archives their last résumé, or clears the pipeline after a
 * successful search, would be thrown back into onboarding as though the months
 * they spent here never happened. Finishing the wizard is something the user
 * *did*, so it is stored.
 *
 * Nothing else keys off this. Per-screen guidance for a user who genuinely has
 * no résumé yet lives in the dashboard's empty states, which stay useful long
 * after the wizard is done and are reachable on every visit (`src/app/page.tsx`).
 *
 * The value is a timestamp rather than a boolean because a bare `true` answers
 * "did they?" and nothing else; a date also answers "when", which is the first
 * thing worth knowing when someone reports that a first run went wrong.
 */
const COMPLETED_KEY = 'onboarding.completedAt'

export async function onboardingComplete(): Promise<boolean> {
  return (await readSetting(COMPLETED_KEY)) !== null
}

export async function completeOnboarding(at: Date = new Date()): Promise<void> {
  await writeSetting({ key: COMPLETED_KEY, value: at.toISOString() })
}
