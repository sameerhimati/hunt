import nodemailer, { type Transporter } from 'nodemailer'

import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, type ConnectionTestResult } from '../types'
import type { EmailAdapter, EmailMessage, SendResult } from './types'

export const smtpMeta: ProviderMeta = {
  id: 'smtp',
  name: 'SMTP',
  category: 'email',
  ship: 'live',
  powers: 'Sends outreach through any mail server you already have.',
  getKeyUrl: 'https://support.google.com/accounts/answer/185833',
  steps: [
    'Find your provider’s SMTP host and port (Gmail: smtp.gmail.com:465).',
    'For Gmail or iCloud, generate an app-specific password — your normal password will not work.',
    'Enter host, port, username and that password here, then Test connection.',
  ],
  freeTier: 'Free — it uses the mailbox you already pay for (or don’t).',
  degradation:
    'Outreach still drafts and you can copy it into your mail client. Nothing else is affected.',
  fields: [
    { key: 'host', label: 'Host', kind: 'text', placeholder: 'smtp.gmail.com' },
    { key: 'port', label: 'Port', kind: 'text', placeholder: '465', defaultValue: '465' },
    { key: 'user', label: 'Username', kind: 'text', placeholder: 'you@gmail.com' },
    { key: 'password', label: 'Password', kind: 'secret', secret: true },
    { key: 'fromAddress', label: 'From address', kind: 'text', placeholder: 'you@gmail.com' },
  ],
}

export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
}

export class SmtpAdapter implements EmailAdapter {
  readonly id = 'smtp'
  readonly meta = smtpMeta
  private readonly transporter: Transporter

  constructor(config: SmtpConfig, transporter?: Transporter) {
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        // 465 is implicit TLS; 587 upgrades via STARTTLS.
        secure: config.port === 465,
        auth: { user: config.user, pass: config.password },
      })
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      })
      return { messageId: info.messageId, sentAt: new Date() }
    } catch (error) {
      throw new AdapterError('SMTP', error instanceof Error ? error.message : 'send failed', {
        cause: error,
        retryable: true,
      })
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const started = Date.now()
    try {
      await this.transporter.verify()
      const durationMs = Date.now() - started
      return { ok: true, detail: `authenticated · ${durationMs}ms`, durationMs }
    } catch (error) {
      return {
        ok: false,
        durationMs: Date.now() - started,
        detail: error instanceof Error ? error.message : 'SMTP handshake failed',
      }
    }
  }
}
