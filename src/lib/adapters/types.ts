import type { ProviderMeta } from '@/lib/providers/types'

/**
 * Every external service sits behind one of these. Two rules, no exceptions:
 * each adapter ships a fixture-backed `Fake*` twin so tests and offline dev
 * never touch the network, and each ships a `meta` block so the app can tell
 * the user where to get the key and what breaks without it.
 */
export interface Adapter {
  readonly id: string
  readonly meta: ProviderMeta
  /**
   * A single cheap authenticated call. Returns a concrete result the Settings
   * card can show verbatim — "200 · 180ms", not a green tick with no evidence.
   */
  testConnection(): Promise<ConnectionTestResult>
}

export interface ConnectionTestResult {
  ok: boolean
  /** Short, user-readable. Shown in mono next to the button. */
  detail: string
  status?: number
  durationMs?: number
}

/**
 * Thrown when a provider fails in a way the user can act on. The message is
 * shown verbatim in the UI, so it must name the provider and the real reason —
 * never a raw stack, never "something went wrong".
 */
export class AdapterError extends Error {
  readonly provider: string
  readonly status?: number
  readonly retryable: boolean

  constructor(
    provider: string,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(`${provider}: ${message}`, { cause: options.cause })
    this.name = 'AdapterError'
    this.provider = provider
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

/** Thrown by stub adapters so the failure is obviously a scope decision, not a bug. */
export class NotWiredError extends AdapterError {
  constructor(provider: string, plannedIn: string) {
    super(provider, `not wired yet — planned for ${plannedIn}. Ships as a stub in v1.`)
    this.name = 'NotWiredError'
  }
}

/** Times a fetch and turns it into a ConnectionTestResult. */
export async function probe(
  provider: string,
  request: () => Promise<Response>,
): Promise<ConnectionTestResult> {
  const started = Date.now()
  try {
    const response = await request()
    const durationMs = Date.now() - started
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        durationMs,
        detail: `${response.status} ${response.statusText || 'error'} · ${durationMs}ms`,
      }
    }
    return { ok: true, status: response.status, durationMs, detail: `${response.status} · ${durationMs}ms` }
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : `${provider}: unreachable`,
    }
  }
}
