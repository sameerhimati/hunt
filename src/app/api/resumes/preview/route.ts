import { NextResponse } from 'next/server'

import { LatexRenderError, renderToPdf } from '@/lib/resume/render'
import { parseResumeContent } from '@/lib/resume/schema'

export const dynamic = 'force-dynamic'
/** Tectonic shells out and reads the filesystem — Node runtime, never edge. */
export const runtime = 'nodejs'

/**
 * Live preview renderer for the editor. A route handler rather than a server
 * action because the answer is a PDF: binary, streamed straight into an
 * `<iframe>`, and pointless to round-trip through an RSC payload.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const { content, templateId, rawLatexOverride } = (body ?? {}) as {
    content?: unknown
    templateId?: string | null
    rawLatexOverride?: string | null
  }

  try {
    const { pdf, pages } = await renderToPdf({
      content: parseResumeContent(content),
      templateId,
      rawLatexOverride,
    })

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        // The preview is regenerated on every edit; caching it would show stale paper.
        'cache-control': 'no-store',
        // A header because the body is the PDF itself. The editor shows this
        // back to the user: tailoring only adds text, and a résumé that has
        // quietly grown a page should say so while it can still be fixed.
        'x-hunt-pages': String(pages),
      },
    })
  } catch (error) {
    if (error instanceof LatexRenderError) {
      // The compiler's own words — the editor shows them inline so a bad
      // \command in the raw-LaTeX tab is fixable without leaving the page.
      return NextResponse.json({ error: error.message, log: error.log }, { status: 422 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Render failed.' },
      { status: 500 },
    )
  }
}
