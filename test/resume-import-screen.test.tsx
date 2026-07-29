// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The screen only reaches the server through `fetch` and one server action.
// The action has its own coverage against the real database; stubbing it keeps
// this suite about what the user sees when the upload comes back.
vi.mock('@/app/resumes/actions', () => ({
  createResumeFromImport: vi.fn(),
}))

const { ImportReview } = await import('@/components/resume/import-review')

/**
 * Importing is the first thing a new user does, and until now it answered "no
 * key configured" with red text and no way forward — on a screen whose own
 * design doc calls for a PDF *drop*. Both of those are what these pin.
 */
afterEach(cleanup)

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

function drop(file: File) {
  const zone = screen.getByTestId('import-dropzone')
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
}

const PDF = () => new File([new Uint8Array([37, 80, 68, 70])], 'resume.pdf', {
  type: 'application/pdf',
})

describe('ImportReview', () => {
  it('offers a drop target, not a bare file input', () => {
    render(<ImportReview />)

    expect(screen.getByTestId('import-dropzone')).toBeDefined()
    expect(screen.getByText(/Drop your PDF here/)).toBeDefined()
    // The input has to remain, and remain focusable, or the screen is
    // unreachable by keyboard — it is only visually hidden.
    const input = screen.getByTestId('import-file') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.className).toContain('sr-only')
  })

  it('accepts a dropped file, not just a chosen one', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 428, json: async () => ({ error: 'x' }) })

    render(<ImportReview />)
    drop(PDF())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/resumes/import')
  })

  it('answers a missing key with the banner that links to the fix', async () => {
    // 428 is the route's designed "no model configured" reply.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 428,
      json: async () => ({ error: 'Importing a PDF needs a language model.' }),
    })

    render(<ImportReview />)
    drop(PDF())

    const link = (await waitFor(() =>
      screen.getByTestId('degraded-banner-link'),
    )) as HTMLAnchorElement

    // Lands on the LLM section rather than a specific card: either key works
    // here, so naming one would be quietly recommending it.
    expect(link.getAttribute('href')).toBe('/settings#section-llm')
    expect(screen.getByText(/start from a blank résumé/i)).toBeDefined()
  })

  it('still shows a real failure as a failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'This PDF has no text layer — it looks like a scan.' }),
    })

    render(<ImportReview />)
    drop(PDF())

    await waitFor(() => expect(screen.getByText(/no text layer/)).toBeDefined())
    // A missing key is a state; an unreadable file is an error. Conflating them
    // is what made the first screen look broken.
    expect(screen.queryByTestId('degraded-banner-link')).toBeNull()
  })
})
