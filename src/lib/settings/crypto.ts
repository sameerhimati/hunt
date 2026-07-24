import crypto from 'node:crypto'
import fs from 'node:fs'

import { ensureDataDir, secretKeyPath } from '@/lib/paths'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
/** Versioned so the format can change without silently mis-decrypting old rows. */
const PREFIX = 'v1'

/**
 * Reads the local secret, generating it on first use. The key is the only thing
 * standing between a stolen `hunt.db` and the user's API keys, so it lives in a
 * separate 0600 file — copying the DB alone leaks nothing.
 */
export function loadOrCreateSecret(): Buffer {
  const keyPath = secretKeyPath()

  if (fs.existsSync(keyPath)) {
    const key = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64')
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `hunt: secret key at ${keyPath} is ${key.length} bytes, expected ${KEY_BYTES}. ` +
          'Refusing to continue — restore the original file or delete it to start fresh ' +
          '(deleting makes existing stored keys unrecoverable).',
      )
    }
    return key
  }

  ensureDataDir()
  const key = crypto.randomBytes(KEY_BYTES)
  fs.writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 })
  // writeFileSync only applies mode on create; be explicit for pre-existing umask oddities.
  fs.chmodSync(keyPath, 0o600)
  return key
}

/** `v1:<iv>:<authTag>:<ciphertext>`, all base64. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, loadOrCreateSecret(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

export function decrypt(sealed: string): string {
  const [version, ivB64, tagB64, ctB64] = sealed.split(':')
  if (version !== PREFIX || !ivB64 || !tagB64 || !ctB64) {
    throw new Error(`hunt: unrecognised ciphertext format (expected "${PREFIX}:iv:tag:ct")`)
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    loadOrCreateSecret(),
    Buffer.from(ivB64, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function isSealed(value: string): boolean {
  return value.startsWith(`${PREFIX}:`)
}

/**
 * `sk-ant-••••••••3f2a`. The only representation of a secret that may ever reach
 * the client, a log line, or an error message.
 */
export function maskSecret(secret: string): string {
  if (!secret) return ''
  if (secret.length <= 8) return '•'.repeat(secret.length)

  // Keep a recognisable vendor prefix (sk-ant-, sk-, fw_, key-) so a user with
  // several keys can tell which one is stored without revealing it.
  const prefixMatch = secret.match(/^(sk-ant-|sk-|fw_|key-|re_|pk-)/)
  const prefix = prefixMatch?.[0] ?? ''
  const tail = secret.slice(-4)
  const hiddenCount = Math.max(4, Math.min(16, secret.length - prefix.length - 4))

  return `${prefix}${'•'.repeat(hiddenCount)}${tail}`
}
