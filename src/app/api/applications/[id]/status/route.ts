import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { transitionApplication, UnknownStatusError } from '@/lib/pipeline/status'

export const dynamic = 'force-dynamic'

/**
 * Status change as a plain form POST + 303 redirect.
 *
 * Deliberately not a server action: this is the one mutation the user makes
 * mid-thought and then immediately navigates away from. A real form submission
 * is a real navigation — the browser doesn't leave the page until the write has
 * committed and the redirect has come back — so "I moved it to Applied and
 * switched to the board" can never race the write. It also means the control
 * works before hydration.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const form = await request.formData().catch(() => null)
  const status = String(form?.get('status') ?? '')

  try {
    await transitionApplication(id, status)
  } catch (error) {
    if (error instanceof UnknownStatusError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  revalidatePath('/pipeline')
  revalidatePath('/')
  revalidatePath(`/applications/${id}`)

  return NextResponse.redirect(new URL(`/applications/${id}`, request.url), 303)
}
