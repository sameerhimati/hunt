import type { ProviderMeta } from '@/lib/providers/types'

import { AdapterError, probe, type ConnectionTestResult } from '../types'
import type { EmailAdapter, EmailMessage, SendResult } from './types'

export const resendMeta: ProviderMeta = {
  id: 'resend',
  name: 'Resend',
  category: 'email',
  ship: 'live',
  powers: 'Sends your outreach emails through your own Resend account.',
  getKeyUrl: 'https://resend.com/api-keys',
  steps: [
    'Create a Resend account and verify a sending domain (or use their onboarding domain to test).',
    'Open API Keys and create one with Send access.',
    'Paste the `re_…` key here and set the From address to a verified sender.',
  ],
  freeTier: 'Free tier covers a few thousand emails a month — far more than a job hunt needs.',
  degradation:
    'Outreach still drafts and you can copy it into your own mail client. hunt just cannot send for you, so it cannot track sends automatically.',
  fields: [
    { key: 'apiKey', label: 'API key', kind: 'secret', secret: true, placeholder: 're_…' },
    {
      key: 'fromAddress',
      label: 'From address',
      kind: 'text',
      placeholder: 'you@yourdomain.com',
      help: 'Must be on a domain you verified in Resend.',
    },
  ],
  envFallback: 'RESEND_API_KEY',
}

const API_BASE = 'https://api.resend.com'

export class ResendAdapter implements EmailAdapter {
  readonly id = 'resend'
  readonly meta = resendMeta

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const response = await this.fetchImpl(`${API_BASE}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    })

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string }

    if (!response.ok) {
      throw new AdapterError('Resend', body.message ?? `returned ${response.status}`, {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      })
    }

    return { messageId: body.id ?? '', sentAt: new Date() }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // Listing domains authenticates without sending anything.
    return probe('Resend', () =>
      this.fetchImpl(`${API_BASE}/domains`, {
        headers: { authorization: `Bearer ${this.apiKey}` },
      }),
    )
  }
}
