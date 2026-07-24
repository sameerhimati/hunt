import { apolloMeta } from './apollo'
import type { PeopleAdapter, PersonHit, PersonQuery } from './types'

import type { ConnectionTestResult } from '../types'

const DEFAULT_FIXTURES: PersonHit[] = [
  {
    name: 'Dana Whitfield',
    title: 'Technical Recruiter',
    company: 'Northwind Robotics',
    email: 'dana.whitfield@northwind.example',
    linkedinUrl: 'https://www.linkedin.com/in/dana-whitfield-example',
    source: 'fake-apollo',
  },
  {
    name: 'Marcus Oyelaran',
    title: 'Engineering Manager, Platform',
    company: 'Northwind Robotics',
    linkedinUrl: 'https://www.linkedin.com/in/marcus-oyelaran-example',
    source: 'fake-apollo',
  },
]

export class FakePeopleAdapter implements PeopleAdapter {
  readonly id = 'fake-people'
  readonly meta = apolloMeta
  readonly queries: PersonQuery[] = []

  constructor(private readonly fixtures: PersonHit[] = DEFAULT_FIXTURES) {}

  async findContacts(query: PersonQuery): Promise<PersonHit[]> {
    this.queries.push(query)
    return this.fixtures.slice(0, query.limit ?? this.fixtures.length)
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, detail: '200 · 0ms · fixture', status: 200, durationMs: 0 }
  }
}
