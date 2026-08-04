// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createManualJobAction = vi.fn<(input: unknown) => Promise<{ error?: string }>>()
const ingestJobAction = vi.fn<(url: string) => Promise<{ error?: string }>>()

vi.mock('@/app/pipeline/actions', () => ({
  createManualJobAction: (input: unknown) => createManualJobAction(input),
  ingestJobAction: (url: string) => ingestJobAction(url),
}))

const { NewApplicationDialog } = await import('@/components/pipeline/new-application-dialog')

afterEach(cleanup)

const POSTING = `Software Engineer, Full Stack
Exa
San Francisco, CA

About the role
We are looking for someone to own retrieval end to end.`

async function openManualTab() {
  render(<NewApplicationDialog />)
  fireEvent.click(screen.getByTestId('new-application'))
  await waitFor(() => expect(screen.getByTestId('manual-entry-tab')).toBeTruthy())
  // Radix activates a tab on mousedown, not click (see test/tailor-workspace.test.tsx).
  fireEvent.mouseDown(screen.getByTestId('manual-entry-tab'), { button: 0 })
  await waitFor(() => expect(screen.getByTestId('manual-jd')).toBeTruthy())
}

function paste(text: string) {
  fireEvent.change(screen.getByTestId('manual-jd'), { target: { value: text } })
}

describe('adding a job by pasting the posting', () => {
  it('fills the role, company and location out of the pasted text', async () => {
    await openManualTab()
    paste(POSTING)

    expect((screen.getByTestId('manual-title') as HTMLInputElement).value).toBe(
      'Software Engineer, Full Stack',
    )
    expect((screen.getByTestId('manual-company') as HTMLInputElement).value).toBe('Exa')
    expect((screen.getByTestId('manual-location') as HTMLInputElement).value).toBe(
      'San Francisco, CA',
    )
  })

  it('keeps what the user typed, and replaces only what it filled itself', async () => {
    await openManualTab()
    paste(POSTING)

    // The user disagrees with the parsed role and fixes it.
    fireEvent.change(screen.getByTestId('manual-title'), { target: { value: 'Founding Engineer' } })
    // Then pastes a different posting over the top.
    paste('Context Engineer\nPostHog\nRemote')

    expect((screen.getByTestId('manual-title') as HTMLInputElement).value).toBe('Founding Engineer')
    expect((screen.getByTestId('manual-company') as HTMLInputElement).value).toBe('PostHog')
    expect((screen.getByTestId('manual-location') as HTMLInputElement).value).toBe('Remote')
  })

  it('stores the pasted text verbatim — it is what tailoring cites', async () => {
    createManualJobAction.mockResolvedValue({})
    await openManualTab()
    paste(POSTING)
    fireEvent.click(screen.getByTestId('create-manual-job'))

    await waitFor(() =>
      expect(createManualJobAction).toHaveBeenCalledWith(
        expect.objectContaining({ company: 'Exa', jdText: POSTING }),
      ),
    )
  })

  it('still takes a posting it cannot read a thing out of', async () => {
    await openManualTab()
    paste('We are hiring! Come and talk to us about the work, we would love to meet you.')

    // Nothing guessed, nothing blocked: the fields are simply the user's to fill.
    expect((screen.getByTestId('manual-company') as HTMLInputElement).value).toBe('')
    expect((screen.getByTestId('create-manual-job') as HTMLButtonElement).disabled).toBe(false)
  })
})
