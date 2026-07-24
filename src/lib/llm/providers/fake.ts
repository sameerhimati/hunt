import {
  estimateTokens,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
  type ModelInfo,
} from '../types'

export interface FakeLlmOptions {
  /** A fixed reply. Ignored when `responder` is set. */
  reply?: string
  /** Derive the reply from the request — for multi-step flows. */
  responder?: (request: LlmRequest) => string
  models?: string[]
  stopReason?: LlmResponse['stopReason']
}

/**
 * The offline twin of every real provider. Tests and e2e run on this, so the
 * suite needs no keys and no network. It also models prompt-cache behaviour so
 * the caching contract is testable without hitting a vendor.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly id = 'fake'
  readonly requests: LlmRequest[] = []

  private readonly options: FakeLlmOptions
  /** Cached prefixes we've "written" — keyed by the frozen prefix bytes. */
  private readonly warmPrefixes = new Set<string>()

  constructor(options: FakeLlmOptions = {}) {
    this.options = options
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request)

    const text = this.options.responder?.(request) ?? this.options.reply ?? ''

    // Everything up to and including the last `cache: true` block is the prefix
    // a real provider would cache — mirrors Anthropic's prefix-match semantics.
    const lastCached = (request.system ?? []).findLastIndex((block) => block.cache)
    const prefix =
      lastCached >= 0
        ? (request.system ?? [])
            .slice(0, lastCached + 1)
            .map((b) => b.text)
            .join('\n\n')
        : ''

    let cacheReadTokens = 0
    let cacheWriteTokens = 0
    if (prefix) {
      const prefixTokens = estimateTokens(prefix)
      if (this.warmPrefixes.has(prefix)) {
        cacheReadTokens = prefixTokens
      } else {
        cacheWriteTokens = prefixTokens
        this.warmPrefixes.add(prefix)
      }
    }

    const uncached = request.messages.map((m) => m.content).join('\n')

    return {
      text,
      model: request.model,
      stopReason: this.options.stopReason ?? 'end_turn',
      usage: {
        inputTokens: estimateTokens(uncached),
        outputTokens: estimateTokens(text),
        cacheReadTokens,
        cacheWriteTokens,
      },
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return (this.options.models ?? ['fake-1']).map((id) => ({ id }))
  }

  reset(): void {
    this.requests.length = 0
    this.warmPrefixes.clear()
  }
}
