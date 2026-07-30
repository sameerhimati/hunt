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
 * Importing is the first thing a new user does, and it used to answer "no key
 * configured" with red text and no way forward — on a screen whose own design
 * doc calls for a PDF *drop*.
 *
 * It can no longer answer that at all: reading a résumé's layout needs no key,
 * so the route has no "missing model" reply left to give. What is worth pinning
 * now is that dropping works, that the screen says which parser read the
 * document, and that a genuine failure still reads as one.
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
    render(<ImportReview hasModel={false} />)

    expect(screen.getByTestId('import-dropzone')).toBeDefined()
    expect(screen.getByText(/Drop your résumé here/)).toBeDefined()
    // The keyless floor is the headline promise of this screen now.
    expect(screen.getByText(/no API key needed/)).toBeDefined()
    expect(screen.getByText(/PDF or \.docx/)).toBeDefined()
    // The input has to remain, and remain focusable, or the screen is
    // unreachable by keyboard — it is only visually hidden.
    const input = screen.getByTestId('import-file') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.className).toContain('sr-only')
  })

  it('accepts a dropped file, not just a chosen one', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: 'x' }) })

    render(<ImportReview hasModel={false} />)
    drop(PDF())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/resumes/import')
  })

  it.each([
    ['layout', 'read from the layout · no model'],
    ['model', 'laid out by a model'],
  ])('says when the parse came from the %s', async (parser, expected) => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: { basics: { name: 'Priya Raghavan' } },
        fieldConfidence: { 'basics.name': 1 },
        text: 'Priya Raghavan',
        fileName: 'resume.pdf',
        parser,
      }),
    })

    render(<ImportReview hasModel={parser === 'model'} />)
    drop(PDF())

    await waitFor(() => expect(screen.getByTestId('import-parser').textContent).toBe(expected))
  })

  it('only promises a half-minute wait when a model will cause one', async () => {
    // Reading the layout is instant; saying "around half a minute" with no model
    // configured would describe a wait that is not going to happen.
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<ImportReview hasModel={false} />)
    drop(PDF())

    await waitFor(() => expect(screen.getByText(/reading your résumé…/)).toBeDefined())
    expect(screen.queryByText(/half a minute/)).toBeNull()
  })

  it('still shows a real failure as a failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'This PDF has no text layer — it looks like a scan.' }),
    })

    render(<ImportReview hasModel={false} />)
    drop(PDF())

    await waitFor(() => expect(screen.getByText(/no text layer/)).toBeDefined())
  })
})
