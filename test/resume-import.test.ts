import { describe, expect, it } from 'vitest'

import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import { extractJsonObject, importResumePdf, ResumeImportError } from '@/lib/resume/import'
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

describe('importResumePdf', () => {
  it('tags the call so the scripted fake can dispatch on it', async () => {
    const { pdf } = await renderToPdf({ content: SOURCE })
    const llm = new FakeLlmProvider({ reply: JSON.stringify(SOURCE) })

    await importResumePdf(pdf, llm)
    expect(promptKindOf(llm.requests[0])).toBe('parse_resume')
  })

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
  })

  it('refuses a PDF with no text layer rather than importing nothing', async () => {
    const llm = new FakeLlmProvider({ reply: '{}' })
    await expect(importResumePdf(Buffer.from('not a pdf'), llm)).rejects.toThrow(ResumeImportError)
  })
})
