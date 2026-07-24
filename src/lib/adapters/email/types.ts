import type { Adapter } from '../types'

export interface EmailMessage {
  to: string
  from: string
  subject: string
  /** Plain text. Outreach that looks hand-written outperforms HTML templates. */
  text: string
  replyTo?: string
}

export interface SendResult {
  /** Provider message id, stored as `Outreach.threadRef` for reply detection. */
  messageId: string
  sentAt: Date
}

export interface EmailAdapter extends Adapter {
  send(message: EmailMessage): Promise<SendResult>
}
