import type { ProviderMeta } from '@/lib/providers/types'

import { NotWiredError, type ConnectionTestResult } from '../types'
import type { LinkedInAdapter, LinkedInPerson } from './types'

/**
 * Dormant seam. Phase 6 was cancelled on 2026-07-26 — cookie-session scraping
 * is the one feature that could get a user's own account restricted, it sits
 * badly against the trust story, and its fixtures go stale by definition. The
 * replacement is a manual contact plus a deep link to the profile, with the
 * outreach drafter writing the message.
 *
 * This file is deliberately kept and deliberately unregistered: it is not in
 * `PROVIDERS`, so it renders no Settings card and `createAdapter` cannot build
 * it. Nothing reaches it. It survives only as the shape Phase 6 would have
 * filled, if that decision is ever revisited.
 */
export const linkedInMeta: ProviderMeta = {
  id: 'linkedin',
  name: 'LinkedIn',
  // 'people' rather than a category of its own: the registry no longer has a
  // LinkedIn section, and this is a people-lookup provider wherever it lands.
  category: 'people',
  ship: 'stub',
  powers: 'Network intel — who you know at a company, and connection degree.',
  getKeyUrl: 'https://www.linkedin.com',
  steps: [
    'Sign in to LinkedIn in your browser.',
    'Open DevTools → Application → Cookies → linkedin.com and copy the `li_at` value.',
    'Paste it here and enable the toggle. hunt only ever reads.',
  ],
  freeTier: 'No API cost — this uses your own logged-in session.',
  degradation:
    'Apollo already finds contacts. Without this you lose "who do I know here" and connection degree, nothing more.',
  risk:
    'Pasting your li_at cookie may violate LinkedIn’s Terms of Service and could get your account restricted. hunt performs read-only requests and never automates actions, but the risk is yours. Off by default — enable only if you accept it.',
  fields: [
    { key: 'enabled', label: 'Enable LinkedIn', kind: 'select', optional: true, defaultValue: 'false', options: [
      { value: 'false', label: 'Off (recommended)' },
      { value: 'true', label: 'On — I accept the risk' },
    ] },
    { key: 'liAt', label: 'li_at cookie', kind: 'secret', secret: true, optional: true },
  ],
}

export class LinkedInCookieAdapter implements LinkedInAdapter {
  readonly id = 'linkedin'
  readonly meta = linkedInMeta

  async findPeopleAtCompany(_company: string, _limit?: number): Promise<LinkedInPerson[]> {
    throw new NotWiredError('LinkedIn', 'a phase that was cancelled')
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, detail: 'stub — not wired in v1' }
  }
}
