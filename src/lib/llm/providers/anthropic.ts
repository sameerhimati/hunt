import Anthropic from '@anthropic-ai/sdk'

import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
  ModelInfo,
} from '../types'

export interface AnthropicProviderOptions {
  apiKey: string
  baseUrl?: string
  /** Injected in tests; the SDK uses global fetch otherwise. */
  fetch?: typeof fetch
  maxRetries?: number
}

function mapStopReason(reason: string | null | undefined): LlmStopReason {
  switch (reason) {
    case 'end_turn':
    case 'max_tokens':
    case 'stop_sequence':
    case 'refusal':
      return reason
    default:
      return 'other'
  }
}

/** Claude, native. The tuned default — prompts and caching are shaped for it. */
export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic'
  private readonly client: Anthropic

  constructor({ apiKey, baseUrl, fetch: fetchImpl, maxRetries }: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
    })
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const message = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      ...(request.system?.length
        ? {
            system: request.system.map((block) => ({
              type: 'text' as const,
              text: block.text,
              // The breakpoint goes on the last frozen block; everything after
              // it (the messages) is the variable part and stays uncached.
              ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
            })),
          }
        : {}),
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      // Only sent when a caller explicitly asked for it — see LlmRequest.
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.stopSequences?.length ? { stop_sequences: request.stopSequences } : {}),
    })

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return {
      text,
      model: message.model,
      stopReason: mapStopReason(message.stop_reason),
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const page = await this.client.models.list({ limit: 100 })
    return page.data.map((model) => ({ id: model.id, displayName: model.display_name }))
  }
}
