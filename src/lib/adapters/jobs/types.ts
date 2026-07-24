import type { Adapter } from '../types'

export interface JobQuery {
  /** Free-text: role, skills, or a full phrase. */
  keywords: string
  location?: string
  remoteOnly?: boolean
  page?: number
}

export interface JobListing {
  /** Stable per-provider id, used to dedupe across adapters. */
  externalId: string
  title: string
  company: string
  location?: string
  url: string
  description?: string
  postedAt?: Date
  remote?: boolean
  source: string
}

export interface JobsAdapter extends Adapter {
  search(query: JobQuery): Promise<JobListing[]>
}
