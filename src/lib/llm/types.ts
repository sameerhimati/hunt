/**
 * One thin surface over "an LLM that can complete a prompt". Claude is the tuned
 * default; the OpenAI-compatible provider covers OpenAI, OpenRouter, Fireworks,
 * Together, Groq, DeepSeek, and local Ollama/vLLM with the same code path.
 */

export type LlmRole = 'user' | 'assistant'

export interface LlmMessage {
  role: LlmRole
  content: string
}

/**
 * A system block. `cache: true` marks it as the end of the frozen prefix — the
 * base résumé is resent on every tailor/score/draft call, so caching it is the
 * single biggest cost lever we have. Keep cached blocks byte-identical.
 */
export interface LlmSystemBlock {
  text: string
  cache?: boolean
}

export interface LlmRequest {
  model: string
  maxTokens: number
  system?: LlmSystemBlock[]
  messages: LlmMessage[]
  /**
   * Deliberately optional and never defaulted: Opus 4.7/4.8 and Fable 5 reject
   * `temperature` outright, so we only send it when a caller means it.
   */
  temperature?: number
  stopSequences?: string[]
}

export type LlmStopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'refusal' | 'other'

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  /** > 0 proves prompt caching is actually working. Logged in dev. */
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface LlmResponse {
  text: string
  model: string
  stopReason: LlmStopReason
  usage: LlmUsage
}

export interface ModelInfo {
  id: string
  displayName?: string
}

export interface LlmProvider {
  readonly id: string
  complete(request: LlmRequest): Promise<LlmResponse>
  /** Always fetched from the provider's `/v1/models`. Never a hardcoded list. */
  listModels(): Promise<ModelInfo[]>
}

/** Joins system blocks for providers with no native block/caching support. */
export function flattenSystem(system?: LlmSystemBlock[]): string | undefined {
  if (!system?.length) return undefined
  return system.map((block) => block.text).join('\n\n')
}

/** Rough char-based estimate. Only used by the fake provider and dev logging. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}
