import { describe, expect, it } from 'vitest'

import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import {
  extractJsonObject,
  importResumePdf,
  importResumeText,
  ResumeImportError,
} from '@/lib/resume/import'
import { renderToPdf } from '@/lib/resume/render'
import { parseResumeContent } from '@/lib/resume/schema'

const SOURCE = parseResumeContent({
  basics: { name: 'Dana Reyes', label: 'Platform Engineer', email: 'dana@example.com' },
  experience: [
    {
      company: 'Northwind',
      title: 'Platform Engineer',
      start: '2021-04',
      bullets: ['Ran the build system for 60 services'],
    },
  ],
})

describe('extractJsonObject', () => {
  it('survives a model that fences its JSON', () => {
    expect(extractJsonObject('```json\n{"basics":{"name":"A"}}\n```')).toEqual({
      basics: { name: 'A' },
    })
  })

  it('names the failure instead of returning junk', () => {
    expect(() => extractJsonObject('I cannot help with that.')).toThrow(ResumeImportError)
    expect(() => extractJsonObject('{ not json }')).toThrow(/malformed/i)
  })
})

// These two build their input by actually compiling a PDF, so they inherit
// Tectonic's cold-start cost: the first compile on a machine downloads the
// binary and fetches TeX packages. `vitest.gates.config.mts` already allows
// 120s for the render gates for exactly this reason; the default 5s here made
// `pnpm verify` fail on any cold cache (fresh clone, CI) and pass on a warm one.
const TECTONIC_COLD_START_MS = 120_000

describe('importResumePdf', () => {
  it('tags the call so the scripted fake can dispatch on it', async () => {
    const { pdf } = await renderToPdf({ content: SOURCE })
    const llm = new FakeLlmProvider({ reply: JSON.stringify(SOURCE) })

    await importResumePdf(pdf, llm)
    expect(promptKindOf(llm.requests[0])).toBe('parse_resume')
  }, TECTONIC_COLD_START_MS)

  it('scores confidence against the PDF text, not the model’s self-report', async () => {
    const { pdf } = await renderToPdf({ content: SOURCE })

    const llm = new FakeLlmProvider({
      reply: JSON.stringify({
        ...SOURCE,
        basics: { ...SOURCE.basics, phone: '+1 (415) 555-0000' },
      }),
    })

    const { fieldConfidence } = await importResumePdf(pdf, llm)

    // Present in the rendered document…
    expect(fieldConfidence['basics.name']).toBe(1)
    // …invented by the model, so it gets flagged for review.
    expect(fieldConfidence['basics.phone']).toBeLessThan(1)
  }, TECTONIC_COLD_START_MS)

  it('refuses a PDF with no text layer rather than importing nothing', async () => {
    const llm = new FakeLlmProvider({ reply: '{}' })
    await expect(importResumePdf(Buffer.from('not a pdf'), llm)).rejects.toThrow(ResumeImportError)
  })
})

/**
 * The re-read path. It is the same pipeline as the PDF import with the
 * extraction step already done, so what is worth pinning is the difference:
 * that it works from stored text alone, and that it refuses honestly when there
 * is nothing stored.
 */
describe('importResumeText — the re-read path', () => {
  const TEXT = [
    'Dana Reyes',
    'Platform Engineer · dana@example.com',
    'EXPERIENCE',
    'Northwind — Platform Engineer — 2021-04 to Present',
    'Ran the build system for 60 services',
  ].join('\n')

  function model(content: unknown) {
    return new FakeLlmProvider({ responder: () => JSON.stringify(content) })
  }

  it('reads a résumé from stored text with no file in hand', async () => {
    const imported = await importResumeText(TEXT, model(SOURCE))

    expect(imported.content.basics.name).toBe('Dana Reyes')
    expect(imported.content.experience[0].company).toBe('Northwind')
  })

  it('returns the text it read, so the caller can check the parse against it', async () => {
    expect((await importResumeText(TEXT, model(SOURCE))).text).toBe(TEXT)
  })

  /**
   * The measured half of the honesty claim: confidence is a check back against
   * the document, not the model's opinion of itself. A field the document does
   * not contain has to score below 1 even though the model stated it firmly.
   */
  it('scores a field the document never mentions below full confidence', async () => {
    const invented = parseResumeContent({
      basics: { name: 'Dana Reyes', email: 'dana@example.com' },
      experience: [
        {
          company: 'Initech',
          title: 'Chief Astronaut',
          start: '2021-04',
          bullets: ['Piloted the shuttle'],
        },
      ],
    })

    const imported = await importResumeText(TEXT, model(invented))
    const weak = Object.entries(imported.fieldConfidence).filter(([, score]) => score < 1)

    expect(weak.length).toBeGreaterThan(0)
    expect(weak.map(([path]) => path).join(' ')).toMatch(/experience/)
  })

  it('refuses an empty source rather than asking a model to read nothing', async () => {
    await expect(importResumeText('   ', model(SOURCE))).rejects.toThrow(ResumeImportError)
    await expect(importResumeText('', model(SOURCE))).rejects.toThrow(/no stored text/i)
  })

  it('reports a model that answers with something that is not a résumé', async () => {
    await expect(
      importResumeText(TEXT, new FakeLlmProvider({ responder: () => 'I cannot help with that.' })),
    ).rejects.toThrow(ResumeImportError)
  })
})
