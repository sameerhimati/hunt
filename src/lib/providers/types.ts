/**
 * Provider metadata is first-class: one declaration drives the Settings card,
 * the docs, and onboarding. If a provider needs a key, the app must be able to
 * tell the user *where to get it*, *how*, *what it costs*, and *what breaks
 * without it* — without anyone writing that copy twice. Honest onboarding.
 */

export type ProviderCategory = 'llm' | 'scrape' | 'jobs' | 'people' | 'email'

/** `live` ships wired in v1; `stub` implements the interface but isn't callable yet. */
export type ProviderShipStatus = 'live' | 'stub'

export type ProviderFieldKind = 'secret' | 'text' | 'url' | 'select' | 'model' | 'password'

export interface ProviderField {
  /** Stored as `provider.<providerId>.<key>`. */
  key: string
  label: string
  kind: ProviderFieldKind
  placeholder?: string
  /** Secrets are sealed at rest and only ever returned masked. */
  secret?: boolean
  optional?: boolean
  help?: string
  /** For `kind: 'select'`. */
  options?: { value: string; label: string }[]
  defaultValue?: string
}

export interface ProviderMeta {
  id: string
  name: string
  category: ProviderCategory
  ship: ProviderShipStatus
  /** One line: what this powers, in the user's terms. */
  powers: string
  /** Deep link straight to the page where the key is issued. */
  getKeyUrl: string
  /** 2–4 concrete steps. No "sign up and get your key". */
  steps: string[]
  /** Honest free-tier note, or how it's priced when there isn't one. */
  freeTier: string
  /** What actually stops working without this key. Never a nag. */
  degradation: string
  fields: ProviderField[]
  /** Rendered as a prominent warning (LinkedIn ToS, account risk). */
  risk?: string
  /** Shown as a small badge, e.g. "tuned default". */
  badge?: string
  /** Dev-only fallback read from the environment when no key is stored. */
  envFallback?: string
}

export type ProviderStatus = 'configured' | 'missing' | 'not-set' | 'error'
