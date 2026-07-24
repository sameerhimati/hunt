import { smtpMeta } from './smtp'
import type { EmailAdapter, EmailMessage, SendResult } from './types'

import type { ConnectionTestResult } from '../types'

/**
 * An in-memory mailbox. E2E asserts against `outbox` instead of standing up a
 * mail server; Phase 4 swaps in mailpit for the real SMTP path.
 */
export class FakeEmailAdapter implements EmailAdapter {
  readonly id = 'fake-email'
  readonly meta = smtpMeta
  readonly outbox: (EmailMessage & { messageId: string; sentAt: Date })[] = []

  private counter = 0

  async send(message: EmailMessage): Promise<SendResult> {
    this.counter += 1
    const result = { messageId: `fake-${this.counter}@hunt.local`, sentAt: new Date() }
    this.outbox.push({ ...message, ...result })
    return result
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, detail: 'authenticated · 0ms · fixture', durationMs: 0 }
  }
}
