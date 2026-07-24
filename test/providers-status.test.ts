import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { anthropicMeta, openAiCompatMeta } from '@/lib/llm/meta'
import { getProvider } from '@/lib/providers/registry'
import { readProviderState, resolveSecret, summarise } from '@/lib/providers/status'
import { writeSetting } from '@/lib/settings/store'

const KEY = 'sk-ant-api03-status-test-4242'

describe('provider status', () => {
  beforeEach(async () => {
    await prisma.setting.deleteMany()
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('reports not-set when nothing is stored', async () => {
    const state = await readProviderState(anthropicMeta)
    expect(state.status).toBe('not-set')
    expect(state.fields.every((field) => field.source === null)).toBe(true)
  })

  it('reports configured once every required field is stored', async () => {
    await writeSetting({ key: 'provider.anthropic.apiKey', value: KEY, secret: true })
    await writeSetting({ key: 'provider.anthropic.model', value: 'claude-sonnet-4-6' })

    const state = await readProviderState(anthropicMeta)
    expect(state.status).toBe('configured')
  })

  it('reports missing when a provider is only half-filled', async () => {
    // A base URL with no key looks configured but cannot work — call it out.
    await writeSetting({ key: 'provider.openai_compat.baseUrl', value: 'https://api.openai.com/v1' })

    const state = await readProviderState(openAiCompatMeta)
    expect(state.status).toBe('missing')
  })

  it('never leaks a stored key into the state sent to the client', async () => {
    await writeSetting({ key: 'provider.anthropic.apiKey', value: KEY, secret: true })

    const state = await readProviderState(anthropicMeta)
    expect(JSON.stringify(state)).not.toContain(KEY)
    expect(state.fields.find((field) => field.key === 'apiKey')?.display).toContain('•')
  })

  it('counts an environment key as configured but labels it as such', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env-0001'
    await writeSetting({ key: 'provider.anthropic.model', value: 'claude-sonnet-4-6' })

    const state = await readProviderState(anthropicMeta)
    const apiKey = state.fields.find((field) => field.key === 'apiKey')

    expect(state.status).toBe('configured')
    expect(apiKey?.source).toBe('env')
    expect(apiKey?.display).toBe('set from environment')
    expect(JSON.stringify(state)).not.toContain('sk-ant-from-env-0001')
  })

  it('prefers a stored key over the environment fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env-0001'
    await writeSetting({ key: 'provider.anthropic.apiKey', value: KEY, secret: true })

    expect(await resolveSecret(anthropicMeta, 'apiKey')).toBe(KEY)
  })

  it('falls back to the environment when nothing is stored', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env-0001'
    expect(await resolveSecret(anthropicMeta, 'apiKey')).toBe('sk-ant-from-env-0001')
  })

  it('treats the no-key board tier as configured with nothing entered', async () => {
    const state = await readProviderState(getProvider('free_boards')!)
    expect(state.status).toBe('configured')
  })

  it('summarises configured vs missing for the topbar', () => {
    const summary = summarise([
      { id: 'a', status: 'configured', fields: [] },
      { id: 'b', status: 'missing', fields: [] },
      { id: 'c', status: 'not-set', fields: [] },
    ])
    expect(summary).toEqual({ configured: 1, missing: 2 })
  })
})
