import { describe, expect, it } from 'vitest'

import { AdapterError } from '@/lib/adapters/types'
import { apolloMeta } from '@/lib/adapters/people/apollo'
import { FakePeopleAdapter } from '@/lib/adapters/people/fake'
import type { PeopleAdapter, PersonHit, PersonQuery } from '@/lib/adapters/people/types'
import { findContactsFor } from '@/lib/contacts/find'
import { deleteContact, listContacts, saveContact } from '@/lib/contacts/store'
import { prisma } from '@/lib/db/client'

async function seedApplication(company = `Northwind-${Math.random()}`) {
  const job = await prisma.job.create({
    data: { title: 'Senior Backend Engineer', company, jdText: 'JD' },
  })
  const application = await prisma.application.create({
    data: { jobId: job.id, status: 'outreach' },
  })
  return application
}

describe('saveContact', () => {
  it('saves a hand-typed contact and lists it back', async () => {
    const application = await seedApplication()

    const saved = await saveContact({
      applicationId: application.id,
      name: '  Jordan Lee  ',
      title: 'Technical Recruiter',
      email: 'jordan@example.com',
    })

    expect(saved.name).toBe('Jordan Lee')
    expect(saved.source).toBe('manual')
    expect(saved.company).toBeNull()

    const listed = await listContacts(application.id)
    expect(listed.map((c) => c.id)).toEqual([saved.id])
  })

  it('updates rather than duplicates when the same email comes back from Apollo', async () => {
    const application = await seedApplication()

    const manual = await saveContact({
      applicationId: application.id,
      name: 'Jordan Lee',
      email: 'Jordan@Example.com',
    })

    const reimported = await saveContact({
      applicationId: application.id,
      name: 'Jordan Lee',
      title: 'Technical Recruiter',
      company: 'Northwind Robotics',
      email: 'jordan@example.com',
      source: 'apollo',
    })

    expect(reimported.id).toBe(manual.id)
    expect(reimported.title).toBe('Technical Recruiter')
    expect(reimported.source).toBe('apollo')
    expect(await listContacts(application.id)).toHaveLength(1)
  })

  it('keeps two emailless humans apart — same company is not the same person', async () => {
    const application = await seedApplication()

    await saveContact({ applicationId: application.id, name: 'Jordan Lee' })
    await saveContact({ applicationId: application.id, name: 'Marcus Oyelaran' })

    expect(await listContacts(application.id)).toHaveLength(2)
  })

  it('refuses a nameless contact, a malformed email and an unknown source', async () => {
    const application = await seedApplication()

    await expect(saveContact({ applicationId: application.id, name: '   ' })).rejects.toThrow(/name/i)
    await expect(
      saveContact({ applicationId: application.id, name: 'Jordan Lee', email: 'jordan-at-example' }),
    ).rejects.toThrow(/email/i)
    await expect(
      saveContact({ applicationId: application.id, name: 'Jordan Lee', source: 'appolo' }),
    ).rejects.toThrow(/appolo/)

    expect(await listContacts(application.id)).toHaveLength(0)
  })
})

describe('deleteContact', () => {
  it('removes the row', async () => {
    const application = await seedApplication()
    const saved = await saveContact({ applicationId: application.id, name: 'Jordan Lee' })

    await deleteContact(saved.id)

    expect(await listContacts(application.id)).toHaveLength(0)
  })
})

describe('findContactsFor', () => {
  it('searches the application company through the people adapter', async () => {
    const application = await seedApplication('Northwind Robotics')
    const adapter = new FakePeopleAdapter()

    const result = await findContactsFor(application.id, {
      adapter,
      titles: ['Technical Recruiter'],
      limit: 1,
    })

    expect(result.reason).toBeNull()
    expect(result.hits.map((hit) => hit.name)).toEqual(['Dana Whitfield'])
    expect(adapter.queries[0]).toMatchObject({
      company: 'Northwind Robotics',
      titles: ['Technical Recruiter'],
      limit: 1,
    })
  })

  it('with no key configured returns no hits and says what a key would buy', async () => {
    const application = await seedApplication()

    // No Apollo key in the test data dir, so the factory itself hands back null.
    const result = await findContactsFor(application.id)

    expect(result.hits).toEqual([])
    expect(result.reason).toBe(apolloMeta.degradation)
  })

  it('resolves the fixture-backed twin under HUNT_TEST_MODE, with no adapter injected', async () => {
    const application = await seedApplication('Northwind Robotics')
    process.env.HUNT_TEST_MODE = '1'
    try {
      const result = await findContactsFor(application.id)
      expect(result.reason).toBeNull()
      expect(result.hits.length).toBeGreaterThan(0)
      expect(result.hits[0].source).toBe('fake-apollo')
    } finally {
      delete process.env.HUNT_TEST_MODE
    }
  })

  it('turns a provider failure into the same shape instead of throwing', async () => {
    const application = await seedApplication()

    const failing: PeopleAdapter = {
      id: 'apollo',
      meta: apolloMeta,
      async findContacts(_query: PersonQuery): Promise<PersonHit[]> {
        throw new AdapterError('Apollo', 'over plan limit', { status: 402 })
      },
      async testConnection() {
        return { ok: false, detail: '402' }
      },
    }

    const result = await findContactsFor(application.id, { adapter: failing })

    expect(result.hits).toEqual([])
    expect(result.reason).toBe('Apollo: over plan limit')
  })
})
