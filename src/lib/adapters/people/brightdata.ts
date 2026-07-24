import type { ProviderMeta } from '@/lib/providers/types'

import { NotWiredError, type ConnectionTestResult } from '../types'
import type { PeopleAdapter, PersonHit, PersonQuery } from './types'

export const brightDataPeopleMeta: ProviderMeta = {
  id: 'brightdata_people',
  name: 'Bright Data — LinkedIn profiles',
  category: 'people',
  ship: 'stub',
  powers: 'Recruiter and hiring-manager lookup from LinkedIn profile datasets.',
  getKeyUrl: 'https://brightdata.com/cp/api_tokens',
  steps: [
    'Open Bright Data → Account settings → API tokens.',
    'Generate a token with dataset access.',
    'Paste it here to use datasets instead of a LinkedIn session cookie.',
  ],
  freeTier: 'Priced per record. Trial credit on signup.',
  degradation:
    'Apollo already covers contact lookup. This is the ToS-safer alternative to the LinkedIn cookie adapter, not a requirement.',
  fields: [{ key: 'apiKey', label: 'API token', kind: 'secret', secret: true, optional: true }],
}

export class BrightDataPeopleAdapter implements PeopleAdapter {
  readonly id = 'brightdata_people'
  readonly meta = brightDataPeopleMeta

  async findContacts(_query: PersonQuery): Promise<PersonHit[]> {
    throw new NotWiredError('Bright Data', 'a post-v1 release')
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: false, detail: 'stub — not wired in v1' }
  }
}
