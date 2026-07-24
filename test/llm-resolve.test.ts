import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { resolveLlm } from '@/lib/llm'
import { DEFAULT_ANTHROPIC_MODEL } from '@/lib/llm/meta'
import { writeSetting } from '@/lib/settings/store'

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const

describe('resolveLlm', () => {
  beforeEach(async () => {
    await prisma.setting.deleteMany()
    for (const key of ENV_KEYS) delete process.env[key]
  })

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it('returns null when no provider is configured — degrade, do not throw', async () => {
    expect(await resolveLlm()).toBeNull()
  })

  it('resolves Anthropic with the default model when only a key is stored', async () => {
    await writeSetting({ key: 'provider.anthropic.apiKey', value: 'sk-ant-x', secret: true })

    const resolved = await resolveLlm()
    expect(resolved?.provider.id).toBe('anthropic')
    expect(resolved?.model).toBe(DEFAULT_ANTHROPIC_MODEL)
  })

  it('honours a model chosen in Settings', async () => {
    await writeSetting({ key: 'provider.anthropic.apiKey', value: 'sk-ant-x', secret: true })
    await writeSetting({ key: 'provider.anthropic.model', value: 'claude-opus-4-8' })

    expect((await resolveLlm())?.model).toBe('claude-opus-4-8')
  })

  it('resolves an OpenAI-compatible provider only when URL, key and model are all set', async () => {
    await writeSetting({ key: 'provider.openai_compat.apiKey', value: 'fw_x', secret: true })
    // No default model is guessed: every provider names its models differently.
    expect(await resolveLlm()).toBeNull()

    await writeSetting({
      key: 'provider.openai_compat.baseUrl',
      value: 'https://api.fireworks.ai/inference/v1',
    })
    await writeSetting({
      key: 'provider.openai_compat.model',
      value: 'accounts/fireworks/models/kimi-k2',
    })

    const resolved = await resolveLlm()
    expect(resolved?.provider.id).toBe('openai-compat')
    expect(resolved?.model).toBe('accounts/fireworks/models/kimi-k2')
  })

  it('prefers Anthropic by default when both are configured', async () => {
    await writeSetting({ key: 'provider.anthropic.apiKey', value: 'sk-ant-x', secret: true })
    await writeSetting({ key: 'provider.openai_compat.apiKey', value: 'fw_x', secret: true })
    await writeSetting({ key: 'provider.openai_compat.baseUrl', value: 'https://x/v1' })
    await writeSetting({ key: 'provider.openai_compat.model', value: 'm' })

    expect((await resolveLlm())?.provider.id).toBe('anthropic')
  })

  it('respects an explicit provider choice', async () => {
    await writeSetting({ key: 'llm.active', value: 'openai_compat' })
    await writeSetting({ key: 'provider.anthropic.apiKey', value: 'sk-ant-x', secret: true })
    await writeSetting({ key: 'provider.openai_compat.apiKey', value: 'fw_x', secret: true })
    await writeSetting({ key: 'provider.openai_compat.baseUrl', value: 'https://x/v1' })
    await writeSetting({ key: 'provider.openai_compat.model', value: 'm' })

    expect((await resolveLlm())?.provider.id).toBe('openai-compat')
  })

  it('falls back to a dev key in the environment', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env'
    expect((await resolveLlm())?.provider.id).toBe('anthropic')
  })
})
