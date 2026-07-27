import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/db/client'
import { createApplication } from '@/lib/pipeline/status'
import { parseResumeContent } from '@/lib/resume/schema'
import { createResume, getVersion, versionContent } from '@/lib/resume/store'
import type { TailorChange } from '@/lib/tailor/types'

/**
 * The save is the last place a reviewed change can quietly vanish: the base is
 * read fresh from the database here, so a résumé edited between the run and the
 * save can leave an accepted change with nowhere to go. Skipping it is right.
 * Returning a version that silently lacks it is the bug — the caller has to be
 * told, or the screen goes on claiming the change was applied.
 *
 * `next/cache` is mocked because `revalidatePath` needs a request scope.
 */
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { saveTailoredVersionAction } = await import('@/app/applications/[id]/tailor/actions')

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = parseResumeContent(
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8')),
)

function change(partial: Partial<TailorChange>): TailorChange {
  return {
    id: 'x',
    kind: 'edit',
    path: '',
    was: null,
    now: '',
    why: 'The posting leads with the charge path.',
    citation: null,
    status: 'proposed',
    ...partial,
  }
}

async function seed() {
  const job = await prisma.job.create({
    data: { title: 'Senior Backend Engineer', company: `Stripe-${Math.random()}`, jdText: 'Go.' },
  })
  const application = await createApplication(job.id)
  const resume = await createResume(`Alex-${Math.random()}`, alexChen)

  return { application, versionId: resume.versions[0].id }
}

describe('saveTailoredVersionAction', () => {
  it('names the accepted change it could not write rather than saving a version that quietly lacks it', async () => {
    const { application, versionId } = await seed()

    const result = await saveTailoredVersionAction({
      applicationId: application.id,
      baseVersionId: versionId,
      accepted: [
        change({ id: 'landed', path: 'basics.label', now: 'Payments Engineer' }),
        change({
          id: 'gone',
          path: `experience[0].bullets[${alexChen.experience[0].bullets.length}]`,
          now: 'Cut p99 latency 38% on the charge path',
        }),
      ],
      label: 'Stripe — Senior Backend Engineer',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.skipped.map((entry) => entry.id)).toEqual(['gone'])
    expect(result.skipped[0].path).toBe('experience[0].bullets[5]')
    expect(result.skipped[0].reason).toBeTruthy()

    // The version is still written — a skip is not a failed save — and it holds
    // exactly what landed, which is what the report says it holds.
    const written = await getVersion(result.version.id)
    expect(written).not.toBeNull()
    const content = versionContent(written!)
    expect(content.basics.label).toBe('Payments Engineer')
    expect(JSON.stringify(content)).not.toContain('38%')
  })

  it('reports nothing skipped on the save that applies cleanly', async () => {
    const { application, versionId } = await seed()

    const result = await saveTailoredVersionAction({
      applicationId: application.id,
      baseVersionId: versionId,
      accepted: [change({ id: 'landed', path: 'basics.label', now: 'Payments Engineer' })],
      label: 'Stripe — Senior Backend Engineer',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skipped).toEqual([])
  })
})
