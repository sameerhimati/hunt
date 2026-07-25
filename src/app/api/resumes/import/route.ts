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
/**
 * A text résumé PDF is tens of KB; one with embedded fonts and a headshot is a
 * couple of MB. 10 is generous for the real thing and still small enough that
 * buffering it can't hurt the single Node process the user is running.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function tooLarge(bytes: number) {
  return NextResponse.json(
    {
      error:
        `That file is ${(bytes / (1024 * 1024)).toFixed(1)} MB — more than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB import limit. ` +
        'If it is mostly scanned images, export a text PDF instead.',
    },
    { status: 413 },
  )
}

export async function POST(request: Request) {
  // Checked before `formData()` because parsing is what buys the whole body into
  // memory — a limit enforced afterwards would already have paid the cost.
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_UPLOAD_BYTES) return tooLarge(declared)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Attach a PDF to import.' }, { status: 400 })
  }

  // A chunked upload arrives without a content-length, so the real size is only
  // knowable here. Both checks are cheap; neither is redundant.
  if (file.size > MAX_UPLOAD_BYTES) return tooLarge(file.size)

  const looksLikePdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || file.type === ''
  if (!looksLikePdf) {
    return NextResponse.json(
      {
        error: `“${file.name}” is not a PDF. Export your résumé as a PDF, or start from a blank one.`,
      },
      { status: 415 },
    )
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
    const { content, fieldConfidence, text } = await importResumePdf(
      Buffer.from(await file.arrayBuffer()),
      llm,
    )
    // `text` ships too: the review screen asks the user to check a parse, and
    // checking it against nothing is not a review. It never leaves this machine.
    return NextResponse.json({ content, fieldConfidence, text, fileName: file.name })
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
