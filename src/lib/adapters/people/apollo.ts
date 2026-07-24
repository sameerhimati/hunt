import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, probe, type ConnectionTestResult } from '../types'
import type { PeopleAdapter, PersonHit, PersonQuery } from './types'

export const apolloMeta: ProviderMeta = {
  id: 'apollo',
  name: 'Apollo',
  category: 'people',
  ship: 'live',
  powers: 'Finds recruiters and hiring managers at your target companies.',
  getKeyUrl: 'https://app.apollo.io/#/settings/integrations/api',
  steps: [
    'Sign in to Apollo and open Settings → Integrations → API.',
    'Create an API key (the free plan allows one).',
    'Paste it here — hunt only ever reads, never writes to your Apollo data.',
  ],
  freeTier: 'Free plan includes a monthly credit allowance for people search and email reveals.',
  degradation:
    'Outreach still drafts and sends fine — you just will not get auto-found contacts. You add recruiters manually on the application page.',
  fields: [{ key: 'apiKey', label: 'API key', kind: 'secret', secret: true }],
  envFallback: 'APOLLO_API_KEY',
}

const API_BASE = 'https://api.apollo.io/api/v1'

interface ApolloSearchResponse {
  people?: {
    name?: string
    title?: string
    email?: string
    linkedin_url?: string
    organization?: { name?: string }
  }[]
  error?: string
  error_message?: string
}

export class ApolloAdapter implements PeopleAdapter {
  readonly id = 'apollo'
  readonly meta = apolloMeta

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async findContacts(query: PersonQuery): Promise<PersonHit[]> {
    const response = await this.fetchImpl(`${API_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        q_organization_name: query.company,
        person_titles: query.titles ?? ['Recruiter', 'Technical Recruiter', 'Engineering Manager'],
        per_page: query.limit ?? 10,
      }),
    })

    const body = (await response.json().catch(() => ({}))) as ApolloSearchResponse

    if (!response.ok) {
      throw new AdapterError(
        'Apollo',
        body.error_message ?? body.error ?? `returned ${response.status}`,
        { status: response.status, retryable: response.status === 429 || response.status >= 500 },
      )
    }

    return (body.people ?? []).map((person) => ({
      name: person.name ?? 'Unknown',
      title: person.title,
      company: person.organization?.name ?? query.company,
      // Apollo returns a locked placeholder until a reveal credit is spent.
      email: person.email && !person.email.includes('email_not_unlocked') ? person.email : undefined,
      linkedinUrl: person.linkedin_url,
      source: 'apollo',
    }))
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return probe('Apollo', () =>
      this.fetchImpl(`${API_BASE}/auth/health`, {
        headers: { 'x-api-key': this.apiKey, accept: 'application/json' },
      }),
    )
  }
}
