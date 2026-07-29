'use server'

import { revalidatePath } from 'next/cache'

import { createAdapter } from '@/lib/adapters/factory'
import type { ConnectionTestResult } from '@/lib/adapters/types'
import { AnthropicProvider } from '@/lib/llm/providers/anthropic'
import { OpenAiCompatProvider } from '@/lib/llm/providers/openai-compat'
import type { ModelInfo } from '@/lib/llm/types'
import { listFieldLabels, missingRequiredFields } from '@/lib/providers/fields'
import { errorKey, getProvider, settingKey } from '@/lib/providers/registry'
import { computeProviderState, resolveSecret } from '@/lib/providers/status'
import {
  deleteSetting,
  readAllMasked,
  readSetting,
  writeSetting,
} from '@/lib/settings/store'

export interface SaveResult {
  ok: boolean
  message: string
}

/**
 * Saves one provider's fields. A blank secret means "leave the stored key
 * alone" — the form only ever shows a mask, so submitting it unchanged must
 * never overwrite the real key with bullet characters.
 *
 * An incomplete form is still written — throwing away a base URL somebody just
 * typed to punish a missing key is hostile, and the next attempt would start
 * from nothing. What it does not do is report success: this used to answer
 * "OpenAI-compatible saved." to a form with no key in it, and the only symptom
 * was tailoring quietly failing later.
 */
export async function saveProvider(providerId: string, formData: FormData): Promise<SaveResult> {
  const meta = getProvider(providerId)
  if (!meta) return { ok: false, message: `Unknown provider "${providerId}".` }

  let written = 0

  for (const field of meta.fields) {
    const raw = formData.get(field.key)
    const value = typeof raw === 'string' ? raw.trim() : ''

    if (!value) {
      if (field.secret) continue // keep what's already stored
      await deleteSetting(settingKey(providerId, field.key))
      continue
    }

    await writeSetting({
      key: settingKey(providerId, field.key),
      value,
      secret: Boolean(field.secret),
    })
    written += 1
  }

  // A successful save invalidates any recorded failure.
  await deleteSetting(errorKey(providerId))
  revalidatePath('/settings')

  // Judged on what is stored *after* the write, so a preserved secret and a dev
  // key in the environment both count — the same rule the status pill uses.
  const state = computeProviderState(meta, await readAllMasked())
  const missing = missingRequiredFields(meta, state.fields)
  const verb = written ? 'saved' : 'unchanged'

  if (missing.length > 0) {
    return {
      ok: false,
      message: `${meta.name} ${verb}, but ${listFieldLabels(missing)} ${
        missing.length > 1 ? 'are' : 'is'
      } still empty — it can't be used yet.`,
    }
  }

  return { ok: true, message: `${meta.name} ${verb}.` }
}

/** Removes every stored field for a provider. Used by the card's Remove action. */
export async function clearProvider(providerId: string): Promise<SaveResult> {
  const meta = getProvider(providerId)
  if (!meta) return { ok: false, message: `Unknown provider "${providerId}".` }

  for (const field of meta.fields) {
    await deleteSetting(settingKey(providerId, field.key))
  }
  await deleteSetting(errorKey(providerId))
  revalidatePath('/settings')

  return { ok: true, message: `${meta.name} key removed.` }
}

/**
 * One cheap authenticated call, reported with a concrete result. A green tick
 * with no evidence isn't worth showing — the user gets the status and the
 * latency, or the actual error the provider returned.
 */
export async function testProviderConnection(providerId: string): Promise<ConnectionTestResult> {
  const meta = getProvider(providerId)
  if (!meta) return { ok: false, detail: `unknown provider "${providerId}"` }

  const result =
    meta.category === 'llm'
      ? await testLlmConnection(providerId)
      : await testAdapterConnection(providerId)

  // Remember failures so the card can show an error state on next page load.
  if (result.ok) {
    await deleteSetting(errorKey(providerId))
  } else {
    await writeSetting({ key: errorKey(providerId), value: result.detail })
  }
  revalidatePath('/settings')

  return result
}

async function testAdapterConnection(providerId: string): Promise<ConnectionTestResult> {
  const adapter = await createAdapter(providerId)
  if (!adapter) return { ok: false, detail: 'not configured — save a key first' }
  return adapter.testConnection()
}

/** For LLM providers, listing models *is* the connection test — one cheap GET. */
async function testLlmConnection(providerId: string): Promise<ConnectionTestResult> {
  const started = Date.now()
  try {
    const models = await discoverModels(providerId)
    const durationMs = Date.now() - started
    return {
      ok: true,
      status: 200,
      durationMs,
      detail: `200 · ${durationMs}ms · ${models.length} models`,
    }
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      detail: error instanceof Error ? error.message : 'connection failed',
    }
  }
}

/**
 * The model list always comes from the provider's own /v1/models. Fireworks
 * alone rotates dozens of models — a list we shipped would be wrong by next week.
 */
export async function discoverModels(providerId: string): Promise<ModelInfo[]> {
  const meta = getProvider(providerId)
  if (!meta) throw new Error(`Unknown provider "${providerId}".`)

  const apiKey = await resolveSecret(meta, 'apiKey')
  if (!apiKey) throw new Error(`${meta.name}: no API key saved yet.`)

  if (providerId === 'anthropic') {
    return new AnthropicProvider({ apiKey }).listModels()
  }

  const baseUrl = await readSetting(settingKey(providerId, 'baseUrl'))
  if (!baseUrl) throw new Error(`${meta.name}: set the base URL first.`)

  return new OpenAiCompatProvider({ apiKey, baseUrl }).listModels()
}

/** Which LLM provider hunt should use when both are configured. */
export async function setActiveLlm(providerId: string): Promise<void> {
  await writeSetting({ key: 'llm.active', value: providerId })
  revalidatePath('/settings')
}
