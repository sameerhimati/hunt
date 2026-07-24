import fs from 'node:fs'

import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { dbPath } from '@/lib/paths'
import {
  deleteSetting,
  hasSetting,
  readAllMasked,
  readMasked,
  readSetting,
  writeSetting,
} from '@/lib/settings/store'

const KEY = 'provider.anthropic.apiKey'
const VALUE = 'sk-ant-api03-supersecret-value-9911'

describe('settings store', () => {
  beforeEach(async () => {
    await prisma.setting.deleteMany()
  })

  it('round-trips a secret through the database', async () => {
    await writeSetting({ key: KEY, value: VALUE, secret: true })
    expect(await readSetting(KEY)).toBe(VALUE)
  })

  it('stores secrets sealed — the plaintext never touches the db file', async () => {
    await writeSetting({ key: KEY, value: VALUE, secret: true })

    const row = await prisma.setting.findUniqueOrThrow({ where: { key: KEY } })
    expect(row.encrypted).toBe(true)
    expect(row.value).not.toContain(VALUE)

    // The real guarantee: grep the raw SQLite file on disk.
    const raw = fs.readFileSync(dbPath())
    expect(raw.includes(Buffer.from(VALUE, 'utf8'))).toBe(false)
  })

  it('stores non-secret settings in the clear so they stay inspectable', async () => {
    await writeSetting({ key: 'ui.theme', value: 'dark' })
    const row = await prisma.setting.findUniqueOrThrow({ where: { key: 'ui.theme' } })
    expect(row.encrypted).toBe(false)
    expect(row.value).toBe('dark')
  })

  it('never hands back a secret in the clear via the masked reads', async () => {
    await writeSetting({ key: KEY, value: VALUE, secret: true })

    const masked = await readMasked(KEY)
    expect(masked).not.toBe(VALUE)
    expect(masked).toContain('•')
    expect(masked?.endsWith('9911')).toBe(true)

    const all = await readAllMasked()
    expect(all[KEY]).toBe(masked)
    expect(JSON.stringify(all)).not.toContain(VALUE)
  })

  it('overwrites an existing key instead of duplicating it', async () => {
    await writeSetting({ key: KEY, value: VALUE, secret: true })
    await writeSetting({ key: KEY, value: 'sk-ant-second-0000', secret: true })

    expect(await readSetting(KEY)).toBe('sk-ant-second-0000')
    expect(await prisma.setting.count({ where: { key: KEY } })).toBe(1)
  })

  it('deletes a key', async () => {
    await writeSetting({ key: KEY, value: VALUE, secret: true })
    expect(await hasSetting(KEY)).toBe(true)

    await deleteSetting(KEY)
    expect(await hasSetting(KEY)).toBe(false)
    expect(await readSetting(KEY)).toBeNull()
  })

  it('returns null for an unset key rather than throwing', async () => {
    expect(await readSetting('provider.nope.apiKey')).toBeNull()
    expect(await readMasked('provider.nope.apiKey')).toBeNull()
  })
})
