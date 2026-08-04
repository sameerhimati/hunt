import { NextResponse } from 'next/server'

import { resolveLlm } from '@/lib/llm'
import { importResumePdf } from '@/lib/resume/import'
import { ResumeImportError } from '@/lib/resume/import-core'
import { isLegacyDoc, parseResumeFile, readableKind } from '@/lib/resume/parse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Résumé upload → parsed résumé, for review.
 *
 * A route handler, not a server action: server action bodies are capped at 1MB
 * and a résumé PDF with embedded fonts blows straight past that. Nothing is
 * written to the database here — the user confirms the parse on the review
 * screen first, so a bad import costs them a click, not a cleanup.
 *
 * **This used to answer 428 when no model was configured, which put an API key
 * in front of the first thing a new user does.** It no longer can. Reading a
 * document's structure out of its own typography needs no key, so that is the
 * floor. A configured model is still used for PDFs, because on a messy
 * real-world résumé it is likely to beat the heuristics — but it is now an
 * attempt with a guaranteed fallback rather than a gate, so a model outage
 * degrades the parse instead of blocking the import.
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

  const bytes = new Uint8Array(await file.arrayBuffer())

  // Sniffed from content rather than trusted from `file.type`, which browsers
  // report inconsistently, or the extension, which is a claim not a fact.
  if (isLegacyDoc(bytes)) {
    return NextResponse.json(
      {
        error: `“${file.name}” is a legacy .doc. Open it and re-save as .docx or PDF, then import it.`,
      },
      { status: 415 },
    )
  }

  const kind = readableKind(bytes, file.name)
  if (!kind) {
    return NextResponse.json(
      {
        error: `“${file.name}” is not a PDF or a .docx. Export your résumé as one of those, or start from a blank one.`,
      },
      { status: 415 },
    )
  }

  try {
    // The keyless parse always runs: it is the floor, and it is also the only
    // path for DOCX, which the model prompt has no text-extraction route for.
    const layout = await parseResumeFile(bytes, file.name)

    if (kind === 'docx') return ok(layout, file.name, 'layout')

    const llm = await resolveLlm()
    if (!llm) return ok(layout, file.name, 'layout')

    try {
      const model = await importResumePdf(Buffer.from(bytes), llm)
      return ok(model, file.name, 'model')
    } catch {
      // A key that is present but broken — expired, out of credit, wrong base
      // URL — used to lose the whole import. There is a good parse in hand, so
      // ship it and say which one it is.
      //
      // **Any** failure, not just a `ResumeImportError`. Narrowing to that one
      // class made the guarantee above true for the tidy failures and false for
      // every other: a provider that throws a bare `TypeError` on a dropped
      // socket, an SDK that raises its own error type, a misconfigured endpoint
      // answering HTML — each rethrew and cost the user an import that had
      // already succeeded. The model is an enhancement on top of the keyless
      // parse, and nothing an enhancement does may take the floor away.
      return ok(layout, file.name, 'layout')
    }
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

/**
 * `text` ships alongside the fields: the review screen asks the user to check a
 * parse, and checking it against nothing is not a review. It never leaves this
 * machine. `parser` ships so the screen can say which one read the document —
 * "no model was involved" is a meaningfully different claim from "a model laid
 * this out", and the user is the one being asked to trust it.
 */
function ok(
  parsed: { content: unknown; fieldConfidence: Record<string, number>; text: string },
  fileName: string,
  parser: 'layout' | 'model',
) {
  return NextResponse.json({ ...parsed, fileName, parser })
}
