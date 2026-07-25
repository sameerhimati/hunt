import { resolveSecret } from '@/lib/providers/status'
import { readSetting } from '@/lib/settings/store'
import { isTestMode, TEST_MODEL } from '@/lib/testmode/env'

import { anthropicMeta, DEFAULT_ANTHROPIC_MODEL, openAiCompatMeta } from './meta'
import { AnthropicProvider } from './providers/anthropic'
import { OpenAiCompatProvider } from './providers/openai-compat'
import type { LlmProvider } from './types'

export interface ResolvedLlm {
  provider: LlmProvider
  /** The model to send. Chosen in Settings, defaulted only for Anthropic. */
  model: string
}

/**
 * Feature code takes either form: a `ResolvedLlm` in production, or a bare
 * provider when a test injects one. Injection is how gates run the real code
 * path with a scripted fake, so it is a first-class shape, not a shortcut.
 */
export type LlmLike = LlmProvider | ResolvedLlm

export function asResolvedLlm(llm: LlmLike): ResolvedLlm {
  if ('provider' in llm) return llm
  // A bare provider carries no model choice. Fakes ignore the field entirely;
  // a real provider passed this way gets the tuned default.
  return { provider: llm, model: llm.id === 'fake' ? TEST_MODEL : DEFAULT_ANTHROPIC_MODEL }
}

/**
 * Picks the active LLM: whichever the user selected, else Anthropic if it has a
 * key, else the OpenAI-compatible provider. Returns null when neither is
 * configured — callers surface a DegradedBanner rather than throwing.
 */
export async function resolveLlm(): Promise<ResolvedLlm | null> {
  // Test mode answers from recorded fixtures keyed by promptKind — same call
  // sites, no key, no network. Lazily imported: the fixture reader touches the
  // filesystem and has no business in the production bundle.
  if (isTestMode()) {
    const { testLlm } = await import('@/lib/testmode/llm')
    return testLlm()
  }

  const preferred = await readSetting('llm.active')

  const candidates = preferred === 'openai_compat' ? ['openai_compat', 'anthropic'] : ['anthropic', 'openai_compat']

  for (const id of candidates) {
    const resolved = id === 'anthropic' ? await resolveAnthropic() : await resolveOpenAiCompat()
    if (resolved) return resolved
  }

  return null
}

async function resolveAnthropic(): Promise<ResolvedLlm | null> {
  const apiKey = await resolveSecret(anthropicMeta, 'apiKey')
  if (!apiKey) return null

  const model = (await readSetting('provider.anthropic.model')) ?? DEFAULT_ANTHROPIC_MODEL
  return { provider: new AnthropicProvider({ apiKey }), model }
}

async function resolveOpenAiCompat(): Promise<ResolvedLlm | null> {
  const apiKey = await resolveSecret(openAiCompatMeta, 'apiKey')
  const baseUrl = await readSetting('provider.openai_compat.baseUrl')
  const model = await readSetting('provider.openai_compat.model')

  // No default model here on purpose: every OpenAI-compatible provider names its
  // models differently, so guessing one would just produce a confusing 404.
  if (!apiKey || !baseUrl || !model) return null

  return { provider: new OpenAiCompatProvider({ apiKey, baseUrl }), model }
}

export * from './types'
export { AnthropicProvider } from './providers/anthropic'
export { FakeLlmProvider } from './providers/fake'
export { OpenAiCompatProvider } from './providers/openai-compat'
export { anthropicMeta, openAiCompatMeta, DEFAULT_ANTHROPIC_MODEL } from './meta'
