import type { ProviderField, ProviderMeta } from './types'

/**
 * Pure field arithmetic, in a leaf module on purpose: the Settings card is a
 * client component, and `registry.ts` / `status.ts` reach for every adapter and
 * the database. Both sides need the *same* answer to "what is still missing" —
 * a save action that says "saved." while the card says "Missing" is the bug this
 * file exists to prevent.
 */

/** The fields that must be filled for a provider to count as configured. */
export function requiredFields(meta: ProviderMeta): ProviderField[] {
  return meta.fields.filter((field) => !field.optional)
}

/**
 * Which required fields still have nothing behind them. `fields` is the state
 * already computed for the provider; a `source` of `null` means neither a
 * stored value nor an environment fallback stands behind it.
 */
export function missingRequiredFields(
  meta: ProviderMeta,
  fields: readonly { key: string; source: string | null }[],
): ProviderField[] {
  const filled = new Set(
    fields.filter((field) => field.source !== null).map((field) => field.key),
  )
  return requiredFields(meta).filter((field) => !filled.has(field.key))
}

/**
 * The variable hunt would read for this field, whether or not it is set. The UI
 * names it, because a key sitting in `.env.local` under a different name
 * (`FIREWORKS_API_KEY` where hunt looks for `OPENAI_API_KEY`) is otherwise
 * invisible — the provider just reads as unconfigured with no explanation.
 */
export function envFallbackFor(meta: ProviderMeta, fieldKey: string): string | null {
  // Only the provider's primary secret has an env fallback; secondary fields
  // (base URL, from-address) are cheap to set in the UI and stay explicit.
  if (!meta.envFallback) return null
  const primary = meta.fields.find((field) => field.secret)
  return primary?.key === fieldKey ? meta.envFallback : null
}

/** "API key" · "API key and Model" · "Base URL, API key and Model". */
export function listFieldLabels(fields: readonly ProviderField[]): string {
  const labels = fields.map((field) => field.label)
  if (labels.length < 2) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}
