import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FakeEmailAdapter } from '@/lib/adapters/email/fake'

function tmpCaptureFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-outbox-')), 'nested', 'outbox.jsonl')
}

describe('fake email capture file', () => {
  it('appends one JSON line per send and creates the directory', async () => {
    const captureFile = tmpCaptureFile()
    const email = new FakeEmailAdapter({ captureFile })

    await email.send({
      to: 'jordan@example.com',
      from: 'alex.chen@example.com',
      subject: 'Quick note',
      text: 'Hi Jordan —',
    })
    await email.send({
      to: 'dana@example.com',
      from: 'alex.chen@example.com',
      subject: 'Following up',
      text: 'Circling back —',
    })

    const lines = fs.readFileSync(captureFile, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)

    const messages = lines.map((line) => JSON.parse(line))
    expect(messages.map((m) => m.to)).toEqual(['jordan@example.com', 'dana@example.com'])
    expect(messages[0].subject).toBe('Quick note')
    expect(messages[0].text).toBe('Hi Jordan —')
    expect(messages[0].from).toBe('alex.chen@example.com')
    expect(messages[0].messageId).toContain('@hunt.local')
    expect(new Date(messages[1].sentAt).getTime()).not.toBeNaN()

    // The file mirrors the mailbox; it does not replace it.
    expect(email.outbox).toHaveLength(2)
    expect(email.outbox[1].subject).toBe('Following up')
  })

  it('keeps working with no capture file, writing nothing to disk', async () => {
    const email = new FakeEmailAdapter()

    const result = await email.send({
      to: 'dana@example.com',
      from: 'me@example.com',
      subject: 'Backend role',
      text: 'Hello Dana —',
    })

    expect(result.messageId).toContain('@hunt.local')
    expect(email.outbox).toHaveLength(1)
  })
})
