import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `saveProvider` used to answer "OpenAI-compatible saved." to a form with no API
 * key in it, and the user found out only when tailoring failed. A save that
 * leaves a required field empty must say so, by name.
 *
 * `next/cache` is mocked because `revalidatePath` needs a request scope no unit
 * test has.
 */
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { saveProvider } = await import('@/app/settings/actions')
const { prisma } = await import('@/lib/db/client')
const { readSetting, writeSetting } = await import('@/lib/settings/store')

const BASE_URL = 'https://api.fireworks.ai/inference/v1'
const MODEL = 'accounts/fireworks/models/kimi-k2-instruct'
const KEY = 'fw-unit-test-key-0001'

function form(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe('saveProvider', () => {
  beforeEach(async () => {
    await prisma.setting.deleteMany()
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it('refuses to call a base-URL-and-model-only save a success', async () => {
    // The exact form the repo owner submitted: everything but the key.
    const result = await saveProvider('openai_compat', form({ baseUrl: BASE_URL, model: MODEL }))

    expect(result.ok).toBe(false)
    expect(result.message).toContain('API key')
  })

  it('keeps what the user typed even when the save is incomplete', async () => {
    // Throwing the base URL away to punish an incomplete form would be hostile.
    await saveProvider('openai_compat', form({ baseUrl: BASE_URL, model: MODEL }))

    expect(await readSetting('provider.openai_compat.baseUrl')).toBe(BASE_URL)
    expect(await readSetting('provider.openai_compat.model')).toBe(MODEL)
  })

  it('names every empty required field, not just the first', async () => {
    const result = await saveProvider('anthropic', form({ apiKey: '', model: '' }))

    expect(result.ok).toBe(false)
    expect(result.message).toContain('API key')
    expect(result.message).toContain('Model')
  })

  it('counts the stored secret that a blank submission deliberately preserves', async () => {
    await writeSetting({ key: 'provider.openai_compat.apiKey', value: KEY, secret: true })

    // Blank secret means "keep the stored key" — that must still read as filled.
    const result = await saveProvider('openai_compat', form({ baseUrl: BASE_URL, model: MODEL }))

    expect(result.ok).toBe(true)
    expect(result.message).toBe('OpenAI-compatible saved.')
    expect(await readSetting('provider.openai_compat.apiKey')).toBe(KEY)
  })

  it('counts an environment fallback as filling the field it stands in for', async () => {
    process.env.OPENAI_API_KEY = 'sk-from-env-0001'

    const result = await saveProvider('openai_compat', form({ baseUrl: BASE_URL, model: MODEL }))

    expect(result.ok).toBe(true)
  })

  it('still reports success for a provider that needs no key at all', async () => {
    const result = await saveProvider('free_boards', form({}))
    expect(result.ok).toBe(true)
  })

  it('reports an unchanged-but-incomplete provider as still unusable', async () => {
    await saveProvider('openai_compat', form({ baseUrl: BASE_URL, model: MODEL }))
    const result = await saveProvider('openai_compat', form({ baseUrl: BASE_URL, model: MODEL }))

    expect(result.ok).toBe(false)
    expect(result.message).toContain('API key')
  })
})
