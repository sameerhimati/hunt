import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

import { decrypt, encrypt, isSealed, loadOrCreateSecret, maskSecret } from '@/lib/settings/crypto'
import { secretKeyPath } from '@/lib/paths'

const SAMPLE_KEY = 'sk-ant-api03-abcdef0123456789abcdef0123456789'

describe('settings crypto', () => {
  it('round-trips a secret', () => {
    expect(decrypt(encrypt(SAMPLE_KEY))).toBe(SAMPLE_KEY)
  })

  it('never emits the plaintext in the ciphertext', () => {
    const sealed = encrypt(SAMPLE_KEY)
    expect(sealed).not.toContain(SAMPLE_KEY)
    expect(sealed).not.toContain('abcdef0123456789')
    expect(isSealed(sealed)).toBe(true)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt(SAMPLE_KEY)).not.toBe(encrypt(SAMPLE_KEY))
  })

  it('rejects tampered ciphertext rather than returning garbage', () => {
    const [v, iv, tag, ct] = encrypt(SAMPLE_KEY).split(':')
    const flipped = Buffer.from(ct, 'base64')
    flipped[0] ^= 0xff
    expect(() => decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow()
  })

  it('rejects an unrecognised ciphertext format', () => {
    expect(() => decrypt('not-actually-sealed')).toThrow(/unrecognised ciphertext/i)
  })

  it('writes the secret key file 0600 and reuses it', () => {
    const first = loadOrCreateSecret()
    const second = loadOrCreateSecret()
    expect(first.equals(second)).toBe(true)
    expect(first).toHaveLength(32)

    const mode = fs.statSync(secretKeyPath()).mode & 0o777
    expect(mode).toBe(0o600)
  })

  describe('maskSecret', () => {
    it('keeps the vendor prefix and last four characters only', () => {
      const masked = maskSecret(SAMPLE_KEY)
      expect(masked.startsWith('sk-ant-')).toBe(true)
      expect(masked.endsWith('6789')).toBe(true)
      expect(masked).not.toContain('api03')
    })

    it('fully masks short values', () => {
      expect(maskSecret('abc123')).toBe('••••••')
    })

    it('handles an empty value', () => {
      expect(maskSecret('')).toBe('')
    })
  })
})
