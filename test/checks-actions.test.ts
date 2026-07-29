import fs from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CheckOutcome, CheckRunInput } from '@/lib/checks/types'
import { prisma } from '@/lib/db/client'
import { createApplication } from '@/lib/pipeline/status'
import { parseResumeContent } from '@/lib/resume/schema'
import { createResume } from '@/lib/resume/store'

// The instruments have their own suites; this one is about the seam between
// them and the database — that a run is persisted, that it reads back, and that
// a check which could not measure keeps its reason across a reload.
const runAllChecks = vi.fn<(input: CheckRunInput) => Promise<CheckOutcome[]>>()

vi.mock('@/lib/checks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/checks')>('@/lib/checks')
  return { ...actual, runAllChecks: (input: CheckRunInput) => runAllChecks(input) }
})

const { loadChecksAction, runChecksAction } = await import(
  '@/app/applications/[id]/checks-actions'
)

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = parseResumeContent(
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8')),
)

const OUTCOMES: CheckOutcome[] = [
  {
    kind: 'parse_fidelity',
    verdict: 'warn',
    summary: '2 of 14 fields dropped',
    details: { dropped: ['basics.url', 'experience[1].start'], checked: 14, verdict: 'warn' },
  },
  {
    kind: 'keyword_coverage',
    verdict: 'warn',
    summary: '18 / 22 JD terms',
    details: { terms: [], matched: [], missing: ['latency'] },
  },
  { kind: 'format_lint', verdict: 'pass', summary: 'clean', details: { issues: [] } },
  { kind: 'ai_tell', verdict: 'pass', summary: 'clean', details: { flags: [] } },
  {
    kind: 'match_rating',
    verdict: 'warn',
    summary: 'Not measured — no model configured',
    details: null,
    error: 'Fit rating needs a language model.',
  },
]

async function seed({ pinned = true }: { pinned?: boolean } = {}) {
  const job = await prisma.job.create({
    data: {
      title: 'Senior Backend Engineer',
      company: `Stripe-${Math.random()}`,
      jdText: 'Go, gRPC, payments.',
    },
  })
  const application = await createApplication(job.id)
  const resume = await createResume(`Alex-${Math.random()}`, alexChen)
  const versionId = resume.versions[0].id

  if (pinned) {
    await prisma.application.update({
      where: { id: application.id },
      data: { resumeVersionId: versionId },
    })
  }

  return { application, job, resume, versionId }
}

beforeEach(() => {
  runAllChecks.mockReset()
  runAllChecks.mockResolvedValue(OUTCOMES)
})

describe('runChecksAction', () => {
  it('measures the pinned version against this posting and stores every reading', async () => {
    const { application, job, versionId } = await seed()

    const result = await runChecksAction(application.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.snapshot.version).toMatchObject({ id: versionId })
    expect(result.snapshot.outcomes.map((outcome) => outcome.kind)).toEqual([
      'parse_fidelity',
      'keyword_coverage',
      'format_lint',
      'ai_tell',
      'match_rating',
    ])

    const input = runAllChecks.mock.calls[0][0]
    expect(input.version.id).toBe(versionId)
    expect(input.job?.id).toBe(job.id)
    expect(input.version.content.basics.name).toBe(alexChen.basics.name)

    const rows = await prisma.checkResult.findMany({ where: { resumeVersionId: versionId } })
    expect(rows).toHaveLength(5)
  })

  it('replaces the previous reading rather than stacking stale ones', async () => {
    const { application, versionId } = await seed()

    await runChecksAction(application.id)
    await runChecksAction(application.id)

    const rows = await prisma.checkResult.findMany({ where: { resumeVersionId: versionId } })
    expect(rows).toHaveLength(5)
  })

  it('says plainly that there is nothing to measure when no version is pinned', async () => {
    const { application } = await seed({ pinned: false })

    const result = await runChecksAction(application.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/no résumé version is pinned/i)
    expect(runAllChecks).not.toHaveBeenCalled()
  })

  it('returns the real reason instead of throwing when the sweep blows up', async () => {
    const { application } = await seed()
    runAllChecks.mockRejectedValue(new Error('tectonic is still downloading'))

    const result = await runChecksAction(application.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('tectonic is still downloading')
  })

  it('does not exist for an application that does not', async () => {
    const result = await runChecksAction('nope')
    expect(result.ok).toBe(false)
  })
})

describe('loadChecksAction', () => {
  it('reads the last run back verbatim, reason included', async () => {
    const { application } = await seed()
    await runChecksAction(application.id)

    const result = await loadChecksAction(application.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.snapshot.outcomes).toEqual(OUTCOMES)
    expect(result.snapshot.hasJd).toBe(true)
    expect(result.snapshot.ranAt).toBeTruthy()
  })

  it('reports an unmeasured application as unmeasured, not as an error', async () => {
    const { application } = await seed()

    const result = await loadChecksAction(application.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.outcomes).toEqual([])
    expect(result.snapshot.ranAt).toBeNull()
  })

  it('keeps the panel readable when a details blob is not ours', async () => {
    const { application, job, versionId } = await seed()
    await prisma.checkResult.create({
      data: {
        resumeVersionId: versionId,
        jobId: job.id,
        kind: 'format_lint',
        verdict: 'pass',
        summary: 'clean',
        details: 'not json at all',
      },
    })

    const result = await loadChecksAction(application.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot.outcomes).toEqual([
      { kind: 'format_lint', verdict: 'pass', summary: 'clean', details: null },
    ])
  })
})
