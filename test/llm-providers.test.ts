import { describe, expect, it, vi } from 'vitest'

import { AnthropicProvider } from '@/lib/llm/providers/anthropic'
import { OpenAiCompatProvider } from '@/lib/llm/providers/openai-compat'

/** Captures the outgoing request so tests can assert on the wire format. */
function stubFetch(body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { fetchImpl, calls }
}

function lastBody(calls: { init: RequestInit }[]) {
  return JSON.parse(String(calls[calls.length - 1].init.body))
}

const ANTHROPIC_MESSAGE = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-6',
  content: [{ type: 'text', text: 'a tailored bullet' }],
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 12,
    output_tokens: 7,
    cache_read_input_tokens: 980,
    cache_creation_input_tokens: 0,
  },
}

describe('AnthropicProvider', () => {
  it('completes and maps usage — including the cache counters', async () => {
    const { fetchImpl, calls } = stubFetch(ANTHROPIC_MESSAGE)
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', fetch: fetchImpl })

    const res = await provider.complete({
      model: 'claude-sonnet-4-6',
      maxTokens: 512,
      system: [{ text: 'frozen resume', cache: true }],
      messages: [{ role: 'user', content: 'tailor this' }],
    })

    expect(res.text).toBe('a tailored bullet')
    expect(res.usage.inputTokens).toBe(12)
    expect(res.usage.outputTokens).toBe(7)
    expect(res.usage.cacheReadTokens).toBe(980)
    expect(res.usage.cacheWriteTokens).toBe(0)
    expect(calls[0].url).toContain('/v1/messages')
  })

  it('marks the last stable system block with cache_control', async () => {
    const { fetchImpl, calls } = stubFetch(ANTHROPIC_MESSAGE)
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', fetch: fetchImpl })

    await provider.complete({
      model: 'claude-sonnet-4-6',
      maxTokens: 512,
      system: [
        { text: 'instructions', cache: false },
        { text: 'frozen resume', cache: true },
      ],
      messages: [{ role: 'user', content: 'tailor this' }],
    })

    const body = lastBody(calls)
    expect(body.system[0].cache_control).toBeUndefined()
    expect(body.system[1].cache_control).toEqual({ type: 'ephemeral' })
    // The variable part must stay after the breakpoint, uncached.
    expect(body.messages[0].content).toBe('tailor this')
  })

  it('omits temperature unless explicitly set — Opus 4.8 and Fable 5 reject it', async () => {
    const { fetchImpl, calls } = stubFetch(ANTHROPIC_MESSAGE)
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', fetch: fetchImpl })

    await provider.complete({
      model: 'claude-opus-4-8',
      maxTokens: 64,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(lastBody(calls)).not.toHaveProperty('temperature')

    await provider.complete({
      model: 'claude-sonnet-4-6',
      maxTokens: 64,
      temperature: 0.2,
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(lastBody(calls).temperature).toBe(0.2)
  })

  it('discovers models from the API instead of a hardcoded list', async () => {
    const { fetchImpl, calls } = stubFetch({
      data: [
        { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6', type: 'model' },
        { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', type: 'model' },
      ],
      has_more: false,
    })
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', fetch: fetchImpl })

    const models = await provider.listModels()
    expect(models.map((m) => m.id)).toEqual(['claude-sonnet-4-6', 'claude-haiku-4-5'])
    expect(models[0].displayName).toBe('Claude Sonnet 4.6')
    expect(calls[0].url).toContain('/v1/models')
  })
})

const OPENAI_COMPLETION = {
  id: 'chatcmpl-1',
  object: 'chat.completion',
  model: 'accounts/fireworks/models/kimi-k2',
  choices: [
    { index: 0, message: { role: 'assistant', content: 'hello back' }, finish_reason: 'stop' },
  ],
  usage: { prompt_tokens: 30, completion_tokens: 4, total_tokens: 34 },
}

describe('OpenAiCompatProvider', () => {
  it('honours a user-set base URL — this is the whole open-model ecosystem', async () => {
    const { fetchImpl, calls } = stubFetch(OPENAI_COMPLETION)
    const provider = new OpenAiCompatProvider({
      apiKey: 'fw_test',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      fetch: fetchImpl,
    })

    const res = await provider.complete({
      model: 'accounts/fireworks/models/kimi-k2',
      maxTokens: 128,
      system: [{ text: 'frozen resume', cache: true }],
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(res.text).toBe('hello back')
    expect(res.usage.inputTokens).toBe(30)
    expect(res.usage.outputTokens).toBe(4)
    expect(calls[0].url).toContain('api.fireworks.ai/inference/v1/chat/completions')
  })

  it('sends the system prompt as a leading system message', async () => {
    const { fetchImpl, calls } = stubFetch(OPENAI_COMPLETION)
    const provider = new OpenAiCompatProvider({
      apiKey: 'fw_test',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      fetch: fetchImpl,
    })

    await provider.complete({
      model: 'm',
      maxTokens: 8,
      system: [{ text: 'part one' }, { text: 'part two', cache: true }],
      messages: [{ role: 'user', content: 'hello' }],
    })

    const body = lastBody(calls)
    expect(body.messages[0]).toEqual({ role: 'system', content: 'part one\n\npart two' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('discovers the model list from /v1/models — never hardcoded', async () => {
    // Fireworks alone rotates dozens of models; any baked-in list is wrong by next week.
    const { fetchImpl, calls } = stubFetch({
      object: 'list',
      data: [
        { id: 'accounts/fireworks/models/kimi-k2', object: 'model' },
        { id: 'accounts/fireworks/models/deepseek-v3', object: 'model' },
        { id: 'accounts/fireworks/models/llama-v3p3-70b', object: 'model' },
      ],
    })
    const provider = new OpenAiCompatProvider({
      apiKey: 'fw_test',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      fetch: fetchImpl,
    })

    const models = await provider.listModels()
    expect(models.map((m) => m.id)).toEqual([
      'accounts/fireworks/models/kimi-k2',
      'accounts/fireworks/models/deepseek-v3',
      'accounts/fireworks/models/llama-v3p3-70b',
    ])
    expect(calls[0].url).toContain('/v1/models')
  })

  it('surfaces a provider error as a readable message, never a raw stack', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const provider = new OpenAiCompatProvider({
      apiKey: 'bad',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      fetch: fetchImpl,
      maxRetries: 0,
    })

    await expect(provider.listModels()).rejects.toThrow(/Invalid API key/)
  })
})
