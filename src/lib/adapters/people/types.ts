import type { Adapter } from '../types'

export interface PersonQuery {
  company: string
  /** e.g. ['Technical Recruiter', 'Engineering Manager'] */
  titles?: string[]
  limit?: number
}

export interface PersonHit {
  name: string
  title?: string
  company?: string
  email?: string
  linkedinUrl?: string
  /** Which adapter produced this, for the Contact source badge. */
  source: string
}

export interface PeopleAdapter extends Adapter {
  findContacts(query: PersonQuery): Promise<PersonHit[]>
}
