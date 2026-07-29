import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Contacts card's server actions.
 *
 * `next/cache` and `next/navigation` are mocked because both need a request
 * scope that no unit test has; what matters here is *that* the action
 * revalidates the three surfaces contacts appear on and *where* it sends the
 * user, which the mocks record faithfully.
 */
const revalidatePath = vi.fn()
const redirect = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

const {
  deleteContactAction,
  draftOutreachAction,
  draftResumeNotice,
  findContactsAction,
  saveContactAction,
} = await import('@/app/outreach/contact-actions')
const { listContacts } = await import('@/lib/contacts/store')
const { TEMPLATE_DRAFT } = await import('@/lib/outreach/types')
const { prisma } = await import('@/lib/db/client')
const { sequenceSteps } = await import('@/lib/outreach/sequence')

const alexChen = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
)

async function seedApplication(company = `Northwind-${Math.random()}`) {
  const job = await prisma.job.create({
    data: { title: 'Senior Backend Engineer', company, jdText: 'Own the charge path.' },
  })
  return prisma.application.create({ data: { jobId: job.id, status: 'outreach' } })
}

async function seedResume(name: string, label: string) {
  const resume = await prisma.resume.create({ data: { name } })
  const version = await prisma.resumeVersion.create({
    data: { resumeId: resume.id, label, content: JSON.stringify(alexChen) },
  })
  return { resume, version }
}

beforeEach(() => {
  revalidatePath.mockClear()
  redirect.mockClear()
})

afterEach(() => {
  delete process.env.HUNT_TEST_MODE
})

describe('saveContactAction', () => {
  it('saves a hand-typed contact and revalidates every surface it shows on', async () => {
    const application = await seedApplication()

    const result = await saveContactAction({
      applicationId: application.id,
      name: '  Jordan Lee  ',
      title: 'Technical Recruiter',
      email: 'jordan@example.com',
    })

    expect(result.error).toBeUndefined()
    expect(result.contact?.name).toBe('Jordan Lee')
    expect(result.contact?.source).toBe('manual')
    expect(await listContacts(application.id)).toHaveLength(1)

    expect(revalidatePath.mock.calls.flat()).toEqual([
      `/applications/${application.id}`,
      '/outreach',
      '/',
    ])
  })

  it('refuses a nameless contact without touching the database', async () => {
    const application = await seedApplication()

    const result = await saveContactAction({ applicationId: application.id, name: '   ' })

    expect(result.error).toMatch(/name/i)
    expect(await listContacts(application.id)).toHaveLength(0)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('maps an adapter’s own source name into the badge vocabulary', async () => {
    const application = await seedApplication()

    // The fixture twin answers `fake-apollo`; the store would reject that
    // outright, and the user never typed it, so the action normalises.
    const result = await saveContactAction({
      applicationId: application.id,
      name: 'Dana Whitfield',
      email: 'dana@northwind.example',
      source: 'fake-apollo',
    })

    expect(result.error).toBeUndefined()
    expect(result.contact?.source).toBe('apollo')
  })

  it('surfaces a malformed address as a message instead of throwing', async () => {
    const application = await seedApplication()

    const result = await saveContactAction({
      applicationId: application.id,
      name: 'Jordan Lee',
      email: 'jordan-at-example',
    })

    expect(result.error).toContain('jordan-at-example')
    expect(await listContacts(application.id)).toHaveLength(0)
  })
})

describe('deleteContactAction', () => {
  it('removes the contact and revalidates its application', async () => {
    const application = await seedApplication()
    const saved = await saveContactAction({ applicationId: application.id, name: 'Jordan Lee' })
    revalidatePath.mockClear()

    const result = await deleteContactAction(saved.contact!.id)

    expect(result.error).toBeUndefined()
    expect(await listContacts(application.id)).toHaveLength(0)
    expect(revalidatePath).toHaveBeenCalledWith(`/applications/${application.id}`)
  })

  it('treats an already-deleted contact as done, not as an error', async () => {
    expect(await deleteContactAction('does-not-exist')).toEqual({})
  })
})

describe('findContactsAction', () => {
  it('returns fixture hits in test mode', async () => {
    process.env.HUNT_TEST_MODE = '1'
    const application = await seedApplication()

    const result = await findContactsAction(application.id)

    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.reason).toBeNull()
    expect(result.error).toBeUndefined()
  })

  it('states what an Apollo key would add when there is none', async () => {
    const application = await seedApplication()

    const result = await findContactsAction(application.id)

    expect(result.hits).toEqual([])
    // Apollo's own degradation string — never re-worded per screen.
    expect(result.reason).toContain('add recruiters manually')
  })
})

describe('draftResumeNotice', () => {
  it('names the pinned version when the application has one', async () => {
    const application = await seedApplication()
    const { version } = await seedResume('Alex Chen — Stripe', 'v4')
    await prisma.application.update({
      where: { id: application.id },
      data: { resumeVersionId: version.id },
    })

    expect(await draftResumeNotice(application.id)).toEqual({
      pinned: true,
      resumeName: 'Alex Chen — Stripe',
      label: 'v4',
    })
  })

  it('names the fallback résumé — and says it is a fallback — when nothing is pinned', async () => {
    const application = await seedApplication()
    const { resume } = await seedResume('Alex Chen — base', 'Base')
    // Most recently updated résumé wins, so touch it after the others exist.
    await prisma.resume.update({ where: { id: resume.id }, data: { name: 'Alex Chen — base' } })

    const notice = await draftResumeNotice(application.id)

    expect(notice.pinned).toBe(false)
    expect(notice.resumeName).toBe('Alex Chen — base')
  })

  it('skips an archived résumé when falling back, and keeps a pinned one', async () => {
    const application = await seedApplication()
    const { resume: archived } = await seedResume('Alex Chen — old', 'v1')
    const { resume: current } = await seedResume('Alex Chen — current', 'v1')

    // The archived one is the most recently touched, so without the filter it
    // would win the fallback and cite a document the user has put away.
    await prisma.resume.update({
      where: { id: archived.id },
      data: { archivedAt: new Date() },
    })

    const notice = await draftResumeNotice(application.id)
    expect(notice.resumeName).toBe('Alex Chen — current')
    expect(current.id).toBeTruthy()
  })

  it('still names an archived résumé when an application is pinned to its version', async () => {
    const application = await seedApplication()
    const { resume, version } = await seedResume('Alex Chen — sent in March', 'v2')
    await prisma.application.update({
      where: { id: application.id },
      data: { resumeVersionId: version.id },
    })
    await prisma.resume.update({ where: { id: resume.id }, data: { archivedAt: new Date() } })

    // Archiving is not a retraction: the application really was sent from this
    // version, and the record of that has to survive putting the document away.
    expect(await draftResumeNotice(application.id)).toEqual({
      pinned: true,
      resumeName: 'Alex Chen — sent in March',
      label: 'v2',
    })
  })
})

describe('draftOutreachAction', () => {
  it('drafts from the scripted model and lands on the composer', async () => {
    process.env.HUNT_TEST_MODE = '1'
    const application = await seedApplication()
    const { version } = await seedResume('Alex Chen', 'v1')
    await prisma.application.update({
      where: { id: application.id },
      data: { resumeVersionId: version.id },
    })
    const saved = await saveContactAction({
      applicationId: application.id,
      name: 'Jordan Lee',
      email: 'jordan@example.com',
    })
    const contactId = saved.contact!.id

    const result = await draftOutreachAction(application.id, contactId)

    expect(result?.error).toBeUndefined()
    const steps = await sequenceSteps({ applicationId: application.id, contactId })
    expect(steps).toHaveLength(3)
    expect(steps[0].subject).toContain('Senior Backend Engineer')
    expect(steps[0].body).toContain('p99')
    // The follow-ups are deterministic, not generated: day 0 / +4 / +9.
    expect(steps.map((step) => step.cumulativeOffset)).toEqual([0, 4, 9])

    // A model wrote step 1, so there is nothing to disclose.
    expect(redirect).toHaveBeenCalledWith(`/outreach?contact=${contactId}`)
  })

  it('falls back to the template sequence when no model is configured — and says so', async () => {
    const application = await seedApplication()
    await seedResume('Alex Chen', 'v1')
    const saved = await saveContactAction({ applicationId: application.id, name: 'Jordan Lee' })
    const contactId = saved.contact!.id

    const result = await draftOutreachAction(application.id, contactId)

    expect(result?.error).toBeUndefined()
    const steps = await sequenceSteps({ applicationId: application.id, contactId })
    expect(steps).toHaveLength(3)
    expect(steps[0].subject).toBeTruthy()
    // The one sentence only the human can write is left to them, in brackets.
    expect(steps[0].body).toContain('[')
    // The composer opens on three plausible-looking messages no model wrote.
    // Handing those over unmarked is the one thing this product refuses.
    expect(redirect).toHaveBeenCalledWith(
      `/outreach?contact=${contactId}&${TEMPLATE_DRAFT.param}=${TEMPLATE_DRAFT.value}`,
    )
  })

  it('drafts even with no résumé at all', async () => {
    const application = await seedApplication()
    const saved = await saveContactAction({ applicationId: application.id, name: 'Jordan Lee' })
    const contactId = saved.contact!.id

    await draftOutreachAction(application.id, contactId)

    const steps = await sequenceSteps({ applicationId: application.id, contactId })
    expect(steps).toHaveLength(3)
  })

  it('does not blame the model for a template it never asked the model about', async () => {
    // Genuinely no résumé — the earlier cases leave versions behind, and
    // `resolveDraftSource` would find one and reach for a model after all.
    await prisma.application.updateMany({ data: { resumeVersionId: null } })
    await prisma.resumeVersion.deleteMany()
    await prisma.resume.deleteMany()

    const application = await seedApplication()
    const saved = await saveContactAction({ applicationId: application.id, name: 'Jordan Lee' })
    const contactId = saved.contact!.id

    await draftOutreachAction(application.id, contactId)

    // The contact card already said "No résumé yet — the draft will be a
    // template you fill in". Nothing was asked of a model here, so nothing is
    // known about one, and "add a key" would be a guess dressed as a diagnosis.
    expect(redirect).toHaveBeenCalledWith(`/outreach?contact=${contactId}`)
  })

  it('opens the existing sequence instead of dealing a second one', async () => {
    const application = await seedApplication()
    const saved = await saveContactAction({ applicationId: application.id, name: 'Jordan Lee' })
    const contactId = saved.contact!.id

    await draftOutreachAction(application.id, contactId)
    await draftOutreachAction(application.id, contactId)

    expect(await sequenceSteps({ applicationId: application.id, contactId })).toHaveLength(3)
    expect(redirect).toHaveBeenCalledTimes(2)
  })

  it('reports a contact that vanished rather than crashing the hub', async () => {
    const application = await seedApplication()

    const result = await draftOutreachAction(application.id, 'gone')

    expect(result?.error).toMatch(/no longer/i)
    expect(redirect).not.toHaveBeenCalled()
  })
})
