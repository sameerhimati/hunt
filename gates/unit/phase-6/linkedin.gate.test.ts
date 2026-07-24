import { describe, expect, it } from 'vitest'

// Phase 6 exit gate — LinkedIn is read-only, fixture-tested, and OFF BY DEFAULT
// even when a cookie is present. The ToS posture is enforced in code.
// RED until src/lib/adapters/linkedin/fake.ts exists and cookie.ts is wired.
//
// VERIFIER GAP (P6's first task): record real voyager-response fixtures,
// including an expired-cookie response and a changed-markup response.
import { FakeLinkedInAdapter } from '@/lib/adapters/linkedin/fake'
import { AdapterError } from '@/lib/adapters/types'
import { createAdapter } from '@/lib/adapters/factory'
import { settingKey } from '@/lib/providers/registry'
import { writeSetting, deleteSetting } from '@/lib/settings/store'

describe('off by default — the load-bearing safety property', () => {
  it('refuses to construct without the explicit opt-in, even with a cookie saved', async () => {
    await writeSetting({ key: settingKey('linkedin', 'liAt'), value: 'AQEDA-fake', secret: true })
    await deleteSetting(settingKey('linkedin', 'enabled'))

    expect(await createAdapter('linkedin')).toBeNull()

    await writeSetting({ key: settingKey('linkedin', 'enabled'), value: 'true' })
    expect(await createAdapter('linkedin')).not.toBeNull()
  })
})

describe('people-graph intel on fixtures', () => {
  it('returns people with connection degree', async () => {
    const adapter = new FakeLinkedInAdapter()
    const people = await adapter.findPeopleAtCompany('Stripe', 5)

    expect(people.length).toBeGreaterThan(0)
    for (const person of people) {
      expect(person.name).toBeTruthy()
      expect(person.profileUrl).toContain('linkedin.com')
    }
    expect(people.some((p) => typeof p.degree === 'number')).toBe(true)
  })

  it('an expired cookie is a clear actionable error, never a crash', async () => {
    const adapter = new FakeLinkedInAdapter({ scenario: 'expired-cookie' })
    await expect(adapter.findPeopleAtCompany('Stripe')).rejects.toThrow(AdapterError)
    await expect(adapter.findPeopleAtCompany('Stripe')).rejects.toThrow(/cookie/i)
  })

  it('changed markup degrades to a clear error, never a silent empty result', async () => {
    const adapter = new FakeLinkedInAdapter({ scenario: 'changed-markup' })
    await expect(adapter.findPeopleAtCompany('Stripe')).rejects.toThrow(AdapterError)
  })
})
