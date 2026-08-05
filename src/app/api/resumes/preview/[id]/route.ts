import { NextResponse } from 'next/server'

import { getPreview } from '@/lib/resume/preview-cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Serves a render the POST above already produced, so the editor can frame a
 * same-origin URL rather than a `blob:` one — the difference between a live
 * preview and a blank white page in Safari.
 *
 * It renders nothing and takes no input beyond the id, which is a UUID minted
 * server-side for bytes hunt just made. Nothing here reads the filesystem or
 * the database, so an id that has aged out is a 404 and the editor asks for a
 * fresh render, exactly as it would after any other miss.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pdf = getPreview(id)

  if (!pdf) {
    return NextResponse.json({ error: 'That preview has expired.' }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'no-store',
      // Framed by the editor on the same origin, and by nothing else.
      'content-disposition': 'inline; filename="resume.pdf"',
    },
  })
}
