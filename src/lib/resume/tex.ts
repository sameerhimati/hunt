import type { ResumeContent } from './schema'
import { getTemplate } from './templates'

/**
 * Content → .tex, with no compiler in sight.
 *
 * Split out from `render.ts` on purpose: rendering shells out to Tectonic and
 * can only run on the server, but the raw-LaTeX tab needs to show the user the
 * .tex their fields produce *in the browser*. Keeping the pure half here is
 * what lets a client component import it without dragging `node:child_process`
 * into the bundle.
 */

export interface TexInput {
  content: ResumeContent
  templateId?: string | null
  /** When set, this is the document — the template is not consulted at all. */
  rawLatexOverride?: string | null
}

export function renderTex(input: TexInput): string {
  const override = input.rawLatexOverride?.trim()
  if (override) return input.rawLatexOverride as string

  return getTemplate(input.templateId).render(input.content)
}
