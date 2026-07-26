import fs from 'node:fs'
import path from 'node:path'

import { smtpMeta } from './smtp'
import type { EmailAdapter, EmailMessage, SendResult } from './types'

import type { ConnectionTestResult } from '../types'

export interface FakeEmailOptions {
  /**
   * Absolute path to a JSONL file every send is appended to. The e2e gate
   * observes sends from a different process than the one that made them, so the
   * in-memory outbox is invisible to it — the capture file *is* the observable
   * send.
   *
   * Always absolute and always supplied by the caller: resolving it against
   * `process.cwd()` in here would make Turbopack's tracer read this module as
   * "the app touches arbitrary files" (same rule as `lib/testmode/fixtures.ts`).
   */
  captureFile?: string
}

/**
 * An in-memory mailbox, optionally mirrored to a file. Unit tests assert on
 * `outbox`; e2e reads the capture file. Mailpit stays an env-flagged smoke —
 * no gate needs a mail server.
 */
export class FakeEmailAdapter implements EmailAdapter {
  readonly id = 'fake-email'
  readonly meta = smtpMeta
  readonly outbox: (EmailMessage & { messageId: string; sentAt: Date })[] = []

  private counter = 0
  private readonly captureFile?: string

  constructor(options: FakeEmailOptions = {}) {
    this.captureFile = options.captureFile
  }

  async send(message: EmailMessage): Promise<SendResult> {
    this.counter += 1
    const result = { messageId: `fake-${this.counter}@hunt.local`, sentAt: new Date() }
    this.outbox.push({ ...message, ...result })
    if (this.captureFile) this.capture(message, result)
    return result
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, detail: 'authenticated · 0ms · fixture', durationMs: 0 }
  }

  private capture(message: EmailMessage, result: SendResult): void {
    const file = this.captureFile
    if (!file) return

    const line = JSON.stringify({
      to: message.to,
      from: message.from,
      subject: message.subject,
      text: message.text,
      messageId: result.messageId,
      sentAt: result.sentAt.toISOString(),
    })

    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${line}\n`)
  }
}
