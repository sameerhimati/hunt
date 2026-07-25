import { NextResponse } from 'next/server'

import { resolveLlm } from '@/lib/llm'
import { importResumePdf, ResumeImportError } from '@/lib/resume/import'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * PDF upload → parsed résumé, for review.
 *
 * A route handler, not a server action: server action bodies are capped at 1MB
 * and a résumé PDF with embedded fonts blows straight past that. Nothing is
 * written to the database here — the user confirms the parse on the review
 * screen first, so a bad import costs them a click, not a cleanup.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Attach a PDF to import.' }, { status: 400 })
  }

  const llm = await resolveLlm()
  if (!llm) {
    return NextResponse.json(
      {
        error:
          'Importing a PDF needs a model key. Add one in Settings, or start from a blank résumé.',
        settingsHref: '/settings',
      },
      { status: 428 },
    )
  }

  try {
    const { content, fieldConfidence } = await importResumePdf(
      Buffer.from(await file.arrayBuffer()),
      llm,
    )
    return NextResponse.json({ content, fieldConfidence, fileName: file.name })
  } catch (error) {
    if (error instanceof ResumeImportError) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed.' },
      { status: 500 },
    )
  }
}
