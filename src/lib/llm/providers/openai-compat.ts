import OpenAI from 'openai'

import {
  flattenSystem,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type LlmStopReason,
  type ModelInfo,
} from '../types'

export interface OpenAiCompatProviderOptions {
  apiKey: string
  /** User-set. This one field is what makes the whole open-model ecosystem work. */
  baseUrl: string
  fetch?: typeof fetch
  maxRetries?: number
}

function mapFinishReason(reason: string | null | undefined): LlmStopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'length':
      return 'max_tokens'
    case 'content_filter':
      return 'refusal'
    default:
      return 'other'
  }
}

/**
 * Anything speaking the OpenAI wire format: OpenAI, OpenRouter, Fireworks,
 * Together, Groq, DeepSeek, local Ollama/vLLM. The model list is always
 * discovered from `/v1/models` — Fireworks alone rotates dozens, so any list we
 * baked in would be wrong within a week.
 */
export class OpenAiCompatProvider implements LlmProvider {
  readonly id = 'openai-compat'
  private readonly client: OpenAI

  constructor({ apiKey, baseUrl, fetch: fetchImpl, maxRetries }: OpenAiCompatProviderOptions) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
    })
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const system = flattenSystem(request.system)

    const completion = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens,
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        ...request.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
    })

    const choice = completion.choices[0]

    return {
      text: choice?.message?.content ?? '',
      model: completion.model,
      stopReason: mapFinishReason(choice?.finish_reason),
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        // Some OpenAI-compatible providers report cached prompt tokens; most don't.
        cacheReadTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: 0,
      },
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const page = await this.client.models.list()
    return page.data.map((model) => ({ id: model.id }))
  }
}
