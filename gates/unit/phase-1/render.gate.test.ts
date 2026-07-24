import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 1 exit gate — deterministic Tectonic rendering across ≥3 templates.
// RED until src/lib/resume/render.ts + templates exist. Requires the Tectonic
// binary (Docker bundles it; bare metal auto-downloads via scripts/ensure-tectonic.mjs).
import { renderToPdf } from '@/lib/resume/render'
import { parseResumeContent } from '@/lib/resume/schema'
import { TEMPLATES } from '@/lib/resume/templates'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))

describe('templates', () => {
  it('ships at least three, including the planned ids', () => {
    const ids = TEMPLATES.map((t: { id: string }) => t.id)
    expect(ids.length).toBeGreaterThanOrEqual(3)
    for (const id of ['jakes', 'moderncv', 'deedy']) expect(ids).toContain(id)
  })
})

describe('rendering', () => {
  for (const templateId of ['jakes', 'moderncv', 'deedy']) {
    it(`renders a real PDF with ${templateId}, byte-stable across runs`, async () => {
      const content = parseResumeContent(alexChen)

      const first = await renderToPdf({ content, templateId })
      expect(first.pdf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(first.pdf.length).toBeGreaterThan(1000)

      // The .tex must actually carry the content (escaping included).
      expect(first.tex).toContain('Alex Chen')
      expect(first.tex).toContain('210ms')
      // $40M/month needs LaTeX escaping — raw '$40M' in tex would break compilation.
      expect(first.tex).toContain('40M')

      // Golden property: same input ⇒ identical bytes (SOURCE_DATE_EPOCH pinned
      // inside renderToPdf). This is what makes version diffs trustworthy.
      const second = await renderToPdf({ content, templateId })
      expect(second.pdf.equals(first.pdf)).toBe(true)
    })
  }

  it('honors the raw-LaTeX escape hatch verbatim', async () => {
    const content = parseResumeContent(alexChen)
    const rawLatexOverride =
      '\\documentclass{article}\\begin{document}Alex Chen — hand-tuned\\end{document}'
    const result = await renderToPdf({ content, rawLatexOverride })
    expect(result.tex).toBe(rawLatexOverride)
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
