import type { Adapter } from '../types'

export interface LinkedInPerson {
  name: string
  title?: string
  company?: string
  profileUrl: string
  /** 1st / 2nd / 3rd degree, when LinkedIn reports it. */
  degree?: number
}

export interface LinkedInAdapter extends Adapter {
  /** Read-only. hunt never performs write actions on a LinkedIn account. */
  findPeopleAtCompany(company: string, limit?: number): Promise<LinkedInPerson[]>
}
