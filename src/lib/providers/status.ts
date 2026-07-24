import { readMasked, readSetting } from '@/lib/settings/store'

import { getProvider, PROVIDERS, requiredFields, settingKey } from './registry'
import type { ProviderMeta, ProviderStatus } from './types'

/** Where a configured value came from — surfaced so dev keys aren't mistaken for saved ones. */
export type ValueSource = 'stored' | 'env' | null

export interface ProviderFieldState {
  key: string
  /** Masked when the field is a secret. Safe to send to the client. */
  display: string | null
  source: ValueSource
}

export interface ProviderState {
  id: string
  status: ProviderStatus
  fields: ProviderFieldState[]
  /** Set when the last connection test failed. */
  errorDetail?: string
}

/**
 * Dev keys in `.env.local` count as configured — that's the whole point of the
 * fallback — but the UI labels them "from environment" so nobody wonders why a
 * key they never saved is showing as live.
 */
function envValue(meta: ProviderMeta, fieldKey: string): string | null {
  // Only the provider's primary secret has an env fallback; secondary fields
  // (base URL, from-address) are cheap to set in the UI and stay explicit.
  if (!meta.envFallback) return null
  const primary = meta.fields.find((field) => field.secret)
  if (!primary || primary.key !== fieldKey) return null
  return process.env[meta.envFallback] ?? null
}

export async function readProviderState(meta: ProviderMeta): Promise<ProviderState> {
  const fields: ProviderFieldState[] = []

  for (const field of meta.fields) {
    const key = settingKey(meta.id, field.key)
    const stored = await readMasked(key)

    if (stored !== null && stored !== '') {
      fields.push({ key: field.key, display: stored, source: 'stored' })
      continue
    }

    const fromEnv = envValue(meta, field.key)
    fields.push(
      fromEnv
        ? { key: field.key, display: 'set from environment', source: 'env' }
        : { key: field.key, display: null, source: null },
    )
  }

  const required = requiredFields(meta).map((field) => field.key)
  const filled = fields.filter((field) => required.includes(field.key) && field.source !== null)

  let status: ProviderStatus
  if (meta.ship === 'stub') {
    // Stubs declare every field optional, which would otherwise make them read
    // as "configured" — claiming a provider works when it cannot is exactly the
    // kind of dishonesty this app is built to avoid.
    status = 'not-set'
  } else if (required.length === 0 || filled.length === required.length) {
    status = 'configured'
  } else if (filled.length > 0) {
    // Half-filled is worse than empty: it looks configured but cannot work.
    status = 'missing'
  } else {
    status = 'not-set'
  }

  const errorDetail = (await readSetting(`provider.${meta.id}.lastError`)) ?? undefined
  if (errorDetail && status === 'configured') status = 'error'

  return { id: meta.id, status, fields, errorDetail }
}

export async function readAllProviderStates(): Promise<ProviderState[]> {
  return Promise.all(PROVIDERS.map(readProviderState))
}

/**
 * Counts only what the user can actually act on. Stubs aren't wired in v1, so
 * listing them as "missing" would invent work that doesn't exist.
 */
export function summarise(states: ProviderState[]): { configured: number; missing: number } {
  const actionable = states.filter((state) => getProvider(state.id)?.ship !== 'stub')
  return {
    configured: actionable.filter((state) => state.status === 'configured').length,
    missing: actionable.filter((state) => state.status !== 'configured').length,
  }
}

/**
 * The plaintext read — server-only, for actually calling a provider. Falls back
 * to the environment so `.env.local` dev keys work without a Settings round-trip.
 */
export async function resolveSecret(meta: ProviderMeta, fieldKey: string): Promise<string | null> {
  const stored = await readSetting(settingKey(meta.id, fieldKey))
  if (stored) return stored
  return envValue(meta, fieldKey)
}
