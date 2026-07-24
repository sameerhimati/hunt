import { prisma } from '@/lib/db/client'

import { decrypt, encrypt, isSealed, maskSecret } from './crypto'

export interface SettingWrite {
  key: string
  value: string
  /** Seal the value at rest. Always true for anything resembling a credential. */
  secret?: boolean
}

/**
 * Reads a setting, transparently unsealing it. Returns the plaintext — callers
 * that hand values to the client must mask first (see `readMasked`).
 */
export async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) return null
  return row.encrypted ? decrypt(row.value) : row.value
}

/** The client-safe read: never returns a secret in the clear. */
export async function readMasked(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) return null
  return row.encrypted ? maskSecret(decrypt(row.value)) : row.value
}

export async function writeSetting({ key, value, secret = false }: SettingWrite): Promise<void> {
  const stored = secret ? encrypt(value) : value
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: stored, encrypted: secret },
    update: { value: stored, encrypted: secret },
  })
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key } })
}

/** All settings with secrets masked — safe to serialise into a page payload. */
export async function readAllMasked(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany()
  const out: Record<string, string> = {}
  for (const row of rows) {
    out[row.key] = row.encrypted ? maskSecret(decrypt(row.value)) : row.value
  }
  return out
}

export async function hasSetting(key: string): Promise<boolean> {
  return (await prisma.setting.count({ where: { key } })) > 0
}

export { isSealed, maskSecret }
