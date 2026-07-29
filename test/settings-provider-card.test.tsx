// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The card's job on a half-configured provider: say which box is empty, name the
 * environment variable it looked for, and let the user get rid of the mess. An
 * empty secret box and a masked stored one used to render identically.
 */
vi.mock('@/app/settings/actions', () => ({
  clearProvider: vi.fn(),
  discoverModels: vi.fn(),
  saveProvider: vi.fn(),
  testProviderConnection: vi.fn(),
}))

const { saveProvider } = await import('@/app/settings/actions')
const { KeyProviderCard } = await import('@/components/settings/key-provider-card')
const { openAiCompatMeta } = await import('@/lib/llm/meta')
const { computeProviderState } = await import('@/lib/providers/status')

afterEach(cleanup)

/** The repo owner's actual state: base URL and model saved, no key anywhere. */
const halfConfigured = () =>
  computeProviderState(openAiCompatMeta, {
    'provider.openai_compat.baseUrl': 'https://api.fireworks.ai/inference/v1',
    'provider.openai_compat.model': 'accounts/fireworks/models/kimi-k2-instruct',
  })

describe('KeyProviderCard', () => {
  it('marks the required fields, so an empty box is not ambiguous', () => {
    render(<KeyProviderCard meta={openAiCompatMeta} state={halfConfigured()} />)

    const apiKey = screen.getByTestId('field-openai_compat-apiKey')
    expect(apiKey.textContent).toContain('required')
  })

  it('names the empty field instead of only pilling the card amber', () => {
    render(<KeyProviderCard meta={openAiCompatMeta} state={halfConfigured()} />)

    expect(screen.getByTestId('missing-fields').textContent).toContain('API key')
    // The two fields the user did fill must not be listed as missing.
    expect(screen.getByTestId('missing-fields').textContent).not.toContain('Base URL')
  })

  it('names the environment variable it looked for and did not find', () => {
    render(<KeyProviderCard meta={openAiCompatMeta} state={halfConfigured()} />)

    expect(screen.getByTestId('field-openai_compat-apiKey').textContent).toContain(
      'OPENAI_API_KEY',
    )
  })

  it('offers Remove on a half-configured provider, not only a working one', () => {
    render(<KeyProviderCard meta={openAiCompatMeta} state={halfConfigured()} />)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })

  it('does not render a failed save in the same grey as a successful one', async () => {
    vi.mocked(saveProvider).mockResolvedValue({
      ok: false,
      message: "OpenAI-compatible saved, but API key is still empty — it can't be used yet.",
    })

    render(<KeyProviderCard meta={openAiCompatMeta} state={halfConfigured()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const note = await screen.findByTestId('save-message')
    expect(note.textContent).toContain('API key')
    expect(note.className).toContain('text-warn')
    expect(note.className).not.toContain('text-muted-foreground')
  })

  it('says nothing about missing fields once the provider is complete', () => {
    const state = computeProviderState(openAiCompatMeta, {
      'provider.openai_compat.baseUrl': 'https://api.openai.com/v1',
      'provider.openai_compat.apiKey': '••••1234',
      'provider.openai_compat.model': 'gpt-4o',
    })

    render(<KeyProviderCard meta={openAiCompatMeta} state={state} />)
    // A working provider starts collapsed; open it so the fields are on screen.
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    expect(screen.getByTestId('field-openai_compat-apiKey')).toBeTruthy()
    expect(screen.queryByTestId('missing-fields')).toBeNull()
    // Nor should it advertise an env var for a field that is already set.
    expect(screen.queryByText(/OPENAI_API_KEY/)).toBeNull()
  })
})
