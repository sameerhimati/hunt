import type { ResumeContent } from '../schema'

export interface ResumeTemplate {
  /** Stable id — also the `Template` row's primary key and the stored `templateId`. */
  id: string
  name: string
  /** One line for the template picker. */
  description: string
  /** The preamble this template compiles with, mirrored into the `Template` row. */
  source: string
  render(content: ResumeContent): string
}
