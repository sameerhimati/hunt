import { resendMeta } from '@/lib/adapters/email/resend'
import { smtpMeta } from '@/lib/adapters/email/smtp'
import { adzunaMeta } from '@/lib/adapters/jobs/adzuna'
import { freeBoardsMeta } from '@/lib/adapters/jobs/boards'
import { jsearchMeta } from '@/lib/adapters/jobs/jsearch'
import { apolloMeta } from '@/lib/adapters/people/apollo'
import { firecrawlMeta } from '@/lib/adapters/scrape/firecrawl'
import { anthropicMeta, openAiCompatMeta } from '@/lib/llm/meta'

import type { ProviderCategory, ProviderField, ProviderMeta } from './types'

/**
 * The single list that drives Settings, onboarding, and the docs. Adding a
 * provider means adding its adapter + meta — no second place to update.
 * Order is the display order on the Settings screen.
 */
export const PROVIDERS: ProviderMeta[] = [
  anthropicMeta,
  openAiCompatMeta,
  firecrawlMeta,
  apolloMeta,
  jsearchMeta,
  adzunaMeta,
  freeBoardsMeta,
  smtpMeta,
  resendMeta,
]

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  llm: 'Language model',
  scrape: 'Scraping',
  jobs: 'Job search',
  people: 'People lookup',
  email: 'Email',
}

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((provider) => provider.id === id)
}

/** Settings are stored flat as `provider.<providerId>.<fieldKey>`. */
export function settingKey(providerId: string, fieldKey: string): string {
  return `provider.${providerId}.${fieldKey}`
}

/**
 * Where a failed connection test is remembered. Namespaced alongside the
 * provider's fields, but not one of them — it's recorded by hunt, not entered.
 */
export function errorKey(providerId: string): string {
  return `provider.${providerId}.lastError`
}

/** The fields that must be filled for a provider to count as configured. */
export function requiredFields(meta: ProviderMeta): ProviderField[] {
  return meta.fields.filter((field) => !field.optional)
}
