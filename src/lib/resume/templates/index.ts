import { deedy } from './deedy'
import { jakes } from './jakes'
import { moderncv } from './moderncv'
import type { ResumeTemplate } from './types'

/**
 * The built-in LaTeX templates. Every one is written against stock TeX packages
 * only — no downloaded document classes, no bundled fonts — because the render
 * has to work on a machine where nothing but the Tectonic binary exists.
 */
export const TEMPLATES: ResumeTemplate[] = [jakes, moderncv, deedy]

export const DEFAULT_TEMPLATE_ID = jakes.id

export function getTemplate(id?: string | null): ResumeTemplate {
  return TEMPLATES.find((template) => template.id === id) ?? jakes
}

export type { ResumeTemplate }
