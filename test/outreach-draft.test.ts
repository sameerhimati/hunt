import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import type { LlmRequest } from '@/lib/llm/types'
import {
  buildSequenceSteps,
  draftOutreach,
  OutreachResponseError,
  OutreachUnavailableError,
  templateSequenceSteps,
} from '@/lib/outreach/draft'
import { parseResumeContent } from '@/lib/resume/schema'

const content = parseResumeContent(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
  ),
)

const job = {
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  jdText: 'Own the charge path. Go, Kafka, ledgers.',
}
const contact = { name: 'Jordan Lee', title: 'Technical Recruiter' }

const BODY =
  'Hi Jordan — I own a ledger service settling $40M/month and cut p99 from 210ms to 130ms. ' +
  'The charge-path reliability work maps directly.'

function llmReturning(payload: unknown) {
  return new FakeLlmProvider({ responder: () => JSON.stringify(payload) })
}

describe('draftOutreach', () => {
  it('keeps citations that resolve and drops the ones that do not', async () => {
    const draft = await draftOutreach({
      content,
      job,
      contact,
      llm: llmReturning({
        subject: 'Senior Backend Engineer — payments reliability background',
        body: BODY,
        citations: [{ path: 'experience[0].bullets[0]' }, { path: 'experience[9].bullets[42]' }],
      }),
    })

    expect(draft.citations.map((c) => c.path)).toEqual(['experience[0].bullets[0]'])
    // The unbacked claim is not the model's to delete — only the chip goes.
    expect(draft.body).toBe(BODY)
  })

  it('tags the call so the scripted fake can dispatch it, and caches the system prefix', async () => {
    const llm = llmReturning({ subject: 'S', body: BODY, citations: [] })
    await draftOutreach({ content, job, contact, llm })

    const request = llm.requests[0] as LlmRequest
    expect(promptKindOf(request)).toBe('outreach')
    expect(request.system?.[1]?.cache).toBe(true)
    expect(request.messages[0].content).toContain('Own the charge path')
  })

  it('tolerates prose around the JSON, and rejects a reply with no message in it', async () => {
    const wrapped = new FakeLlmProvider({
      reply: `Sure — here you go:\n\n{"subject":"S","body":"${BODY}","citations":[]}\n\nHope that helps.`,
    })
    await expect(draftOutreach({ content, job, contact, llm: wrapped })).resolves.toMatchObject({
      subject: 'S',
    })

    await expect(
      draftOutreach({ content, job, contact, llm: llmReturning({ subject: 'S', body: '  ' }) }),
    ).rejects.toBeInstanceOf(OutreachResponseError)
  })

  it('reports the missing model instead of throwing something the UI cannot read', async () => {
    await expect(draftOutreach({ content, job, contact, llm: null })).rejects.toBeInstanceOf(
      OutreachUnavailableError,
    )
  })
})

describe('sequence steps', () => {
  const draft = { subject: 'Intro', body: BODY, citations: [] }

  it('puts the draft first and follows it with two deterministic nudges', () => {
    const steps = buildSequenceSteps(draft, { job, contact })

    expect(steps).toHaveLength(3)
    expect(steps.map((s) => s.dayOffset)).toEqual([0, 4, 5])
    expect(steps[0]).toMatchObject({ subject: 'Intro', body: BODY })
    expect(steps[1].subject).toBe('Re: Senior Backend Engineer — quick follow-up')
    expect(steps[2].subject).toBe('Senior Backend Engineer — closing the loop')

    // Follow-ups have no evidence behind them, so they assert nothing.
    for (const step of steps.slice(1)) {
      expect(step.body).toContain('Senior Backend Engineer')
      expect(step.body).not.toMatch(/p99|\$40M/)
    }
  })

  it('offers a keyless starter sequence with the same cadence', () => {
    const steps = templateSequenceSteps({ job, contact })

    expect(steps.map((s) => s.dayOffset)).toEqual([0, 4, 5])
    expect(steps[0].body).toContain('Jordan')
    expect(steps[0].body).toContain('Stripe')
  })
})
