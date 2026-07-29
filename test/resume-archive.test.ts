import { describe, expect, it } from 'vitest'

import { prisma } from '@/lib/db/client'
import { emptyResume } from '@/lib/resume/schema'
import {
  archiveResume,
  countResumes,
  createResume,
  deleteResume,
  getResume,
  listArchivedResumes,
  listResumes,
  restoreResume,
  resumeApplicationCount,
  saveVersion,
  versionTree,
} from '@/lib/resume/store'

/**
 * Archiving is the delete path, and the reason is provenance:
 * `Application.resumeVersionId` is `SetNull`, so a hard delete would quietly
 * turn a tailored, sent application into "Not yet tailored". These tests pin
 * both halves — archived résumés leave every list, and every pin survives.
 */

async function pinApplication(versionId: string, company: string) {
  const job = await prisma.job.create({
    data: { title: 'Senior Backend Engineer', company, jdText: 'Own the charge path.' },
  })
  return prisma.application.create({
    data: { jobId: job.id, status: 'applied', resumeVersionId: versionId },
  })
}

describe('archiving a résumé', () => {
  it('drops it from every list without touching the row', async () => {
    const kept = await createResume('Kept', emptyResume('Kept'))
    const retired = await createResume('Retired', emptyResume('Retired'))

    const before = await countResumes()
    await archiveResume(retired.id)

    const names = (await listResumes()).map((resume) => resume.name)
    expect(names).toContain('Kept')
    expect(names).not.toContain('Retired')
    expect(await countResumes()).toBe(before - 1)

    expect((await listArchivedResumes()).map((resume) => resume.id)).toContain(retired.id)
    expect(await getResume(retired.id)).not.toBeNull()

    // And it comes back whole.
    await restoreResume(retired.id)
    expect((await listResumes()).map((resume) => resume.id)).toContain(retired.id)
    expect(kept.id).toBeTruthy()
  })

  it('keeps a sent application pinned to the exact version it was sent', async () => {
    const resume = await createResume('Alex Chen', emptyResume('Alex Chen'))
    const [base] = await versionTree(resume.id)
    const tailored = await saveVersion({
      resumeId: resume.id,
      content: emptyResume('Alex Chen'),
      label: 'Stripe v2',
      parentVersionId: base.id,
    })
    const application = await pinApplication(tailored.id, 'Stripe')

    await archiveResume(resume.id)

    const reloaded = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      include: { resumeVersion: { include: { resume: true } } },
    })

    // The pin is what PinnedResume renders. A null here is the "Not yet
    // tailored" lie this whole design exists to prevent.
    expect(reloaded.resumeVersionId).toBe(tailored.id)
    expect(reloaded.resumeVersion?.label).toBe('Stripe v2')
    expect(reloaded.resumeVersion?.resume.name).toBe('Alex Chen')
  })
})

describe('deleting a résumé', () => {
  it('refuses while any application pins one of its versions', async () => {
    const resume = await createResume('Referenced', emptyResume('Referenced'))
    const [base] = await versionTree(resume.id)
    await pinApplication(base.id, 'Linear')

    expect(await resumeApplicationCount(resume.id)).toBe(1)
    await expect(deleteResume(resume.id)).rejects.toThrow(/1 application pin/i)
    expect(await getResume(resume.id)).not.toBeNull()
  })

  it('removes a résumé nothing points at, versions and all', async () => {
    const resume = await createResume('Unreferenced', emptyResume('Unreferenced'))
    const [base] = await versionTree(resume.id)
    await saveVersion({
      resumeId: resume.id,
      content: emptyResume('Unreferenced'),
      label: 'draft',
      parentVersionId: base.id,
    })

    expect(await resumeApplicationCount(resume.id)).toBe(0)
    await deleteResume(resume.id)

    expect(await getResume(resume.id)).toBeNull()
    expect(await prisma.resumeVersion.count({ where: { resumeId: resume.id } })).toBe(0)
  })
})
