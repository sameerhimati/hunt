import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/db/client'
import { FitUnavailableError } from '@/lib/fit/rate'
import { MODEL_REMEDY, modelRequired } from '@/lib/llm/unavailable'
import { OutreachUnavailableError } from '@/lib/outreach/draft'
import { CoverLetterUnavailableError } from '@/lib/tailor/cover-letter'
import { TailorUnavailableError } from '@/lib/tailor/engine'

/**
 * "hunt needs a model key" is one fact with one remedy, and it used to be
 * written five times — five wordings of the same sentence, one of which a
 * component matched with a regular expression. A user who hits two of them in
 * one session should not have to work out whether they are the same problem.
 *
 * So this file pins the shared half. The feature name varies (it is the only
 * part that legitimately differs); the fact and the way out do not.
 *
 * `next/cache` is mocked because the tailor actions revalidate, and
 * `revalidatePath` needs a request scope no unit test has.
 */
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { runTailorAction } = await import('@/app/applications/[id]/tailor/actions')
const { POST } = await import('@/app/api/resumes/import/route')

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const

/** Every place hunt has to say "this needs a model", and the feature it names. */
const MESSAGES: Record<string, string> = {
  Tailoring: new TailorUnavailableError().message,
  'Fit rating': new FitUnavailableError().message,
  'Drafting outreach': new OutreachUnavailableError().message,
  'Drafting a cover letter': new CoverLetterUnavailableError().message,
}

describe('modelRequired', () => {
  it('states the fact, then the remedy, then what still works', () => {
    expect(modelRequired('Tailoring', 'the résumé editor still works')).toBe(
      `Tailoring needs a language model. ${MODEL_REMEDY} — the résumé editor still works.`,
    )
  })

  it('is the single source of every keyless message', () => {
    for (const message of Object.values(MESSAGES)) {
      expect(message).toContain('needs a language model.')
      expect(message).toContain(MODEL_REMEDY)
    }
  })

  it('still names the feature that is gated, so the user knows what they lost', () => {
    for (const [feature, message] of Object.entries(MESSAGES)) {
      expect(message.startsWith(`${feature} needs`)).toBe(true)
    }
  })
})

describe('the keyless paths that report a message rather than throw', () => {
  beforeEach(async () => {
    await prisma.setting.deleteMany()
    for (const key of ENV_KEYS) delete process.env[key]
  })

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it('gives the tailor action the engine’s own sentence rather than a sixth wording', async () => {
    const resume = await prisma.resume.create({ data: { name: 'Alex Chen' } })
    const version = await prisma.resumeVersion.create({
      data: { resumeId: resume.id, label: 'v1', content: JSON.stringify({ basics: {} }) },
    })
    const job = await prisma.job.create({
      data: { title: 'Backend', company: 'Stripe', jdText: 'Own the charge path.' },
    })
    const application = await prisma.application.create({ data: { jobId: job.id } })

    const result = await runTailorAction(application.id, version.id)

    expect(result.ok).toBe(false)
    expect(result.ok ? null : result.error).toBe(new TailorUnavailableError().message)
  })

  it('answers a PDF import with the same sentence and no half-wired link', async () => {
    const body = new FormData()
    body.set('file', new File([new Uint8Array([1, 2, 3])], 'resume.pdf', { type: 'application/pdf' }))

    const response = await POST(new Request('http://localhost/api/resumes/import', {
      method: 'POST',
      body,
    }))
    const payload = await response.json()

    expect(response.status).toBe(428)
    expect(payload.error).toContain('needs a language model.')
    expect(payload.error).toContain(MODEL_REMEDY)
    // The client renders `error` and nothing else; a href nobody reads is a
    // link the user never gets, dressed as one they do.
    expect(payload.settingsHref).toBeUndefined()
  })
})
