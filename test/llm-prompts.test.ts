import { describe, expect, it } from 'vitest'

import { FakeLlmProvider } from '@/lib/llm'
import { kindBlock, promptKindOf, PROMPT_KINDS, runPrompt } from '@/lib/llm/prompts'

describe('prompt kind tagging', () => {
  it('puts the kind block first so the scripted fake can dispatch', async () => {
    const llm = new FakeLlmProvider({ reply: 'ok' })

    await runPrompt({
      llm,
      model: 'm',
      kind: 'tailor',
      maxTokens: 64,
      system: [{ text: 'BASE RESUME', cache: true }],
      messages: [{ role: 'user', content: 'go' }],
    })

    const request = llm.requests[0]
    expect(request.system?.[0]).toEqual({ text: 'kind:tailor' })
    expect(promptKindOf(request)).toBe('tailor')
    // The caller's cached prefix survives untouched — cache hits depend on it.
    expect(request.system?.[1]).toEqual({ text: 'BASE RESUME', cache: true })
  })

  it('reports no kind for a hand-built request', () => {
    expect(promptKindOf({ system: [{ text: 'you are helpful' }] })).toBeNull()
    expect(promptKindOf({})).toBeNull()
    // A kind outside the closed vocabulary is a typo, not a new feature.
    expect(promptKindOf({ system: [{ text: 'kind:taylor' }] })).toBeNull()
  })

  it('tags every declared kind unambiguously', () => {
    for (const kind of PROMPT_KINDS) {
      expect(promptKindOf({ system: [kindBlock(kind)] })).toBe(kind)
    }
  })
})
