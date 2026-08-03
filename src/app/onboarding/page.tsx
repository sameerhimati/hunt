import { redirect } from 'next/navigation'

import { OnboardingWizard, type KeyRow } from '@/components/onboarding/onboarding-wizard'
import { resolveLlm } from '@/lib/llm'
import { onboardingComplete } from '@/lib/onboarding/state'
import { getProvider, requiredFields } from '@/lib/providers/registry'
import { readAllProviderStates } from '@/lib/providers/status'

export const dynamic = 'force-dynamic'

/**
 * The four rows the keys step offers, and only four.
 *
 * The registry holds nine providers; showing all of them here would make the
 * first screen a configuration matrix. So this is a curated shortlist — one per
 * thing a user can *do* — while the copy on each row still comes from the
 * provider's own `meta`, so it cannot drift from Settings or the docs.
 *
 * `anthropic` fronts the LLM slot rather than the OpenAI-compatible endpoint
 * because it needs one field and no base URL, which is the difference between a
 * paste and a decision on somebody's first minute. Everything else, including
 * the other LLM provider, is a click away in Settings.
 */
const ROWS: { slot: KeyRow['slot']; providerId: string; placeholder?: string }[] = [
  { slot: 'llm', providerId: 'anthropic', placeholder: 'sk-ant-…' },
  { slot: 'firecrawl', providerId: 'firecrawl' },
  { slot: 'apollo', providerId: 'apollo' },
  { slot: 'email', providerId: 'smtp' },
]

export default async function OnboardingPage() {
  // Finished already? Then this route is a stale bookmark or a back button, and
  // re-running setup is not what the user asked for. Settings owns every one of
  // these controls permanently.
  if (await onboardingComplete()) redirect('/')

  const [states, hasModel] = await Promise.all([
    readAllProviderStates(),
    resolveLlm().then(Boolean),
  ])

  const rows: KeyRow[] = []
  for (const { slot, providerId, placeholder } of ROWS) {
    const meta = getProvider(providerId)
    if (!meta) continue

    // The first required field is what the row collects. A provider needing
    // more than one (SMTP host, port, user…) is offered here as its headline
    // secret and finished in Settings, rather than turning a row into a form.
    const field = requiredFields(meta)[0]
    if (!field) continue

    rows.push({
      slot,
      meta,
      configured: states.find((state) => state.id === providerId)?.status === 'configured',
      fieldKey: field.key,
      fieldLabel: field.label,
      placeholder,
    })
  }

  return <OnboardingWizard rows={rows} hasModel={hasModel} />
}
