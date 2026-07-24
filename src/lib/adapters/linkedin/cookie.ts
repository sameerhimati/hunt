import type { ProviderMeta } from '@/lib/providers/types'

import { NotWiredError, type ConnectionTestResult } from '../types'
import type { LinkedInAdapter, LinkedInPerson } from './types'

/**
 * Off by default and gated behind an explicit risk acknowledgement. hunt reads
 * only — no connection requests, no messages, no write automation of any kind.
 * Ships as a stub in v1; the interface exists so Phase 6 has a shape to fill.
 */
export const linkedInMeta: ProviderMeta = {
  id: 'linkedin',
  name: 'LinkedIn',
  category: 'linkedin',
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
    throw new NotWiredError('LinkedIn', 'Phase 6')
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, detail: 'stub — not wired in v1' }
  }
}
