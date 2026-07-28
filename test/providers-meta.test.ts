import { describe, expect, it } from 'vitest'

import { PROVIDERS, getProvider, requiredFields, settingKey } from '@/lib/providers/registry'

/**
 * Provider metadata is the honest-onboarding contract: if a provider ships
 * without "where to get the key" or "what breaks without it", the Settings card
 * silently becomes the "figure it out yourself" experience we're avoiding.
 */
describe('provider registry', () => {
  it('registers every provider under a unique id', () => {
    const ids = PROVIDERS.map((provider) => provider.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(PROVIDERS.map((provider) => [provider.id, provider] as const))(
    '%s ships complete onboarding copy',
    (_id, provider) => {
      expect(provider.name).toBeTruthy()
      expect(provider.powers).toBeTruthy()
      expect(provider.degradation.length).toBeGreaterThan(20)
      expect(provider.freeTier).toBeTruthy()
      expect(provider.steps.length).toBeGreaterThanOrEqual(1)
      expect(provider.steps.length).toBeLessThanOrEqual(4)
      expect(provider.fields.length).toBeGreaterThan(0)
    },
  )

  it.each(PROVIDERS.filter((p) => p.fields.some((f) => f.secret)).map((p) => [p.id, p] as const))(
    '%s that needs a key links straight to where the key is issued',
    (_id, provider) => {
      expect(provider.getKeyUrl).toMatch(/^https:\/\//)
    },
  )

  it('marks every credential field as a secret so it is sealed at rest', () => {
    for (const provider of PROVIDERS) {
      for (const field of provider.fields) {
        const looksLikeCredential = /key|password|token|secret|li_at|liAt/i.test(field.key)
        if (looksLikeCredential) {
          expect(field.secret, `${provider.id}.${field.key} must be secret`).toBe(true)
        }
      }
    }
  })

  it('asks for nothing a user could be harmed by giving', () => {
    // The only provider that ever carried a `risk` statement was LinkedIn,
    // which wanted a session cookie and could get the user's own account
    // restricted. It was cut on 2026-07-28 rather than shipped with a warning.
    expect(getProvider('linkedin')).toBeUndefined()
    expect(PROVIDERS.filter((provider) => provider.risk)).toEqual([])
  })

  it('namespaces settings so two providers cannot collide on a field name', () => {
    expect(settingKey('anthropic', 'apiKey')).toBe('provider.anthropic.apiKey')
    expect(settingKey('firecrawl', 'apiKey')).toBe('provider.firecrawl.apiKey')
  })

  it('treats optional fields as not required for configuration', () => {
    const boards = getProvider('free_boards')!
    // The no-key tier must count as configured out of the box.
    expect(requiredFields(boards)).toHaveLength(0)
  })

  it('covers every category the plan promises', () => {
    const categories = new Set(PROVIDERS.map((provider) => provider.category))
    expect([...categories].sort()).toEqual(['email', 'jobs', 'llm', 'people', 'scrape'])
  })
})
