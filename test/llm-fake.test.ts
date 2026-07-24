import { describe, expect, it } from 'vitest'

import { FakeLlmProvider } from '@/lib/llm/providers/fake'

const BASE_RESUME = 'FROZEN RESUME PREFIX — the same bytes on every tailoring call.'

describe('FakeLlmProvider', () => {
  it('completes a round-trip and echoes the model back', async () => {
    const llm = new FakeLlmProvider({ reply: 'tailored bullet' })

    const res = await llm.complete({
      model: 'fake-1',
      maxTokens: 256,
      system: [{ text: BASE_RESUME, cache: true }],
      messages: [{ role: 'user', content: 'Tailor this for a backend role.' }],
    })

    expect(res.text).toBe('tailored bullet')
    expect(res.model).toBe('fake-1')
    expect(res.stopReason).toBe('end_turn')
    expect(res.usage.outputTokens).toBeGreaterThan(0)
  })

  it('records every request so tests can assert on prompt assembly', async () => {
    const llm = new FakeLlmProvider({ reply: 'ok' })
    await llm.complete({
      model: 'fake-1',
      maxTokens: 16,
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(llm.requests).toHaveLength(1)
    expect(llm.requests[0].messages[0].content).toBe('hello')
  })

  it('reports a cache read once the same prefix is sent again', async () => {
    const llm = new FakeLlmProvider({ reply: 'ok' })
    const request = {
      model: 'fake-1',
      maxTokens: 16,
      system: [{ text: BASE_RESUME, cache: true }],
      messages: [{ role: 'user' as const, content: 'first' }],
    }

    const cold = await llm.complete(request)
    expect(cold.usage.cacheReadTokens).toBe(0)
    expect(cold.usage.cacheWriteTokens).toBeGreaterThan(0)

    const warm = await llm.complete({ ...request, messages: [{ role: 'user', content: 'second' }] })
    expect(warm.usage.cacheReadTokens).toBeGreaterThan(0)
    expect(warm.usage.cacheWriteTokens).toBe(0)
  })

  it('treats a changed prefix as a cache miss', async () => {
    const llm = new FakeLlmProvider({ reply: 'ok' })
    await llm.complete({
      model: 'fake-1',
      maxTokens: 16,
      system: [{ text: BASE_RESUME, cache: true }],
      messages: [{ role: 'user', content: 'a' }],
    })

    const changed = await llm.complete({
      model: 'fake-1',
      maxTokens: 16,
      system: [{ text: `${BASE_RESUME} (edited)`, cache: true }],
      messages: [{ role: 'user', content: 'a' }],
    })

    expect(changed.usage.cacheReadTokens).toBe(0)
  })

  it('can be scripted with a responder for multi-step flows', async () => {
    const llm = new FakeLlmProvider({
      responder: (req) => `saw:${req.messages[req.messages.length - 1].content}`,
    })

    const res = await llm.complete({
      model: 'fake-1',
      maxTokens: 16,
      messages: [{ role: 'user', content: 'ping' }],
    })
    expect(res.text).toBe('saw:ping')
  })

  it('lists its fixture models rather than a hardcoded vendor list', async () => {
    const llm = new FakeLlmProvider({ reply: 'ok', models: ['fake-1', 'fake-2'] })
    expect((await llm.listModels()).map((m) => m.id)).toEqual(['fake-1', 'fake-2'])
  })
})
