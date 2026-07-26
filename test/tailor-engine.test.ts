import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import type { LlmRequest } from '@/lib/llm/types'
import { parseResumeContent } from '@/lib/resume/schema'
import { applyChanges } from '@/lib/tailor/apply'
import { runTailor, TailorResponseError, TailorUnavailableError } from '@/lib/tailor/engine'
import type { TailorChange } from '@/lib/tailor/types'
import { validateChanges } from '@/lib/tailor/validator'

const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures')

const content = parseResumeContent(
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8')),
)
const script = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'llm/tailor-stripe.json'), 'utf8'))

const job = {
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  jdText: 'Own the charge path. p99 under 150ms. Go, Kafka, ledgers.',
}

function llmReturning(payload: unknown) {
  return new FakeLlmProvider({
    responder: () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  })
}

const CITED_BULLET = 'experience[0].bullets[3]'

describe('runTailor', () => {
  it('round-trips the recorded Stripe run: every proposal survives, judged', async () => {
    const run = await runTailor({ content, job, llm: llmReturning(script.response) })

    expect(run.job).toEqual(job)
    expect(run.changes).toHaveLength(3)
    expect(run.changes.map((change) => change.id)).toEqual(['change-1', 'change-2', 'change-3'])

    const [cited, uncited, misCited] = run.changes
    expect(cited.status).toBe('proposed')
    expect(cited.was).toBe(content.experience[0].bullets[3])
    expect(uncited.status).toBe('refused')
    expect(uncited.refusedReason).toMatch(/no source/i)
    expect(misCited.status).toBe('refused')
    expect(misCited.refusedReason).toContain('experience[9].bullets[9]')
  })

  it('applies the accepted subset and leaves the rest of the document alone', async () => {
    const run = await runTailor({ content, job, llm: llmReturning(script.response) })
    const accepted = run.changes.filter((change) => change.status === 'proposed')

    const applied = applyChanges(content, accepted)

    expect(applied.experience[0].bullets[3]).toBe(accepted[0].now)
    expect(applied.experience[0].bullets).toHaveLength(content.experience[0].bullets.length)
    expect({ ...applied, experience: [] }).toEqual({ ...content, experience: [] })
    expect(applied.experience[1]).toEqual(content.experience[1])
    // The base version is what the user re-tailors from — it must be untouched.
    expect(content.experience[0].bullets[3]).toMatch(/by account cohort$/)
  })

  it('treats "no changes proposed" as an outcome, not an error', async () => {
    const run = await runTailor({ content, job, llm: llmReturning({ changes: [] }) })

    expect(run.changes).toEqual([])
    expect(applyChanges(content, run.changes)).toEqual(content)
  })

  it('reads JSON out of a reply wrapped in prose', async () => {
    const run = await runTailor({
      content,
      job,
      llm: llmReturning(`Sure — here are the changes:\n${JSON.stringify(script.response)}\nHope that helps.`),
    })

    expect(run.changes).toHaveLength(3)
  })

  it('names an unusable response instead of half-applying it', async () => {
    for (const reply of ['I cannot help with that.', '{ "changes": ', '{ "notes": "none" }']) {
      await expect(runTailor({ content, job, llm: llmReturning(reply) })).rejects.toBeInstanceOf(
        TailorResponseError,
      )
    }
  })

  it('names the missing key rather than crashing when no model is configured', async () => {
    await expect(runTailor({ content, job, llm: null })).rejects.toBeInstanceOf(
      TailorUnavailableError,
    )
  })

  it('tags the request `kind:tailor` and caches the résumé and posting', async () => {
    let seen: LlmRequest | null = null
    const llm = new FakeLlmProvider({
      responder: (request) => {
        seen = request
        return JSON.stringify({ changes: [] })
      },
    })

    await runTailor({ content, job, llm })

    const request = seen as unknown as LlmRequest
    expect(promptKindOf(request)).toBe('tailor')
    // The tag block, then the frozen prefix: instructions + résumé + posting.
    expect(request.system?.slice(1).every((block) => block.cache)).toBe(true)
    expect(request.system?.some((block) => block.text.includes('p99 under 150ms'))).toBe(true)

    // The second run re-sends an identical prefix, which is the point of caching.
    await runTailor({ content, job, llm })
    expect(llm.requests).toHaveLength(2)
  })
})

describe('validateChanges', () => {
  it('never drops an entry, whatever the model sent', () => {
    const junk = [null, 'a string', {}, { kind: 'edit' }, { kind: 'nonsense', path: 'basics.name' }]
    const validated = validateChanges(junk, content)

    expect(validated).toHaveLength(junk.length)
    expect(validated.every((change) => change.status === 'refused')).toBe(true)
    expect(validated.every((change) => Boolean(change.refusedReason))).toBe(true)
  })

  it('accepts a citation quoted loosely but refuses one quoted wrongly', () => {
    const [loose, forged] = validateChanges(
      [
        {
          kind: 'edit',
          path: CITED_BULLET,
          now: 'Cut p99 latency 38% on the charge path',
          why: 'The posting leads with latency.',
          citation: { path: CITED_BULLET, snippet: '  reduced P99   from 210ms to 130ms  ' },
        },
        {
          kind: 'edit',
          path: CITED_BULLET,
          now: 'Cut p99 latency 38% on the charge path',
          why: 'The posting leads with latency.',
          citation: { path: CITED_BULLET, snippet: 'reduced p99 from 800ms to 130ms' },
        },
      ],
      content,
    )

    expect(loose.status).toBe('proposed')
    expect(forged.status).toBe('refused')
  })

  it('accepts a coarse citation to a whole entry', () => {
    const [checked] = validateChanges(
      [
        {
          kind: 'edit',
          path: 'experience[1].bullets[0]',
          now: 'Orchestrated 1.2M daily bank-link attempts in Go',
          why: 'Volume first.',
          citation: { path: 'experience[1]', snippet: '1.2M link attempts per day' },
        },
      ],
      content,
    )

    expect(checked.status).toBe('proposed')
  })
})

describe('applyChanges', () => {
  function change(partial: Partial<TailorChange>): TailorChange {
    return {
      id: 'x',
      kind: 'edit',
      path: '',
      now: '',
      why: '',
      citation: null,
      status: 'proposed',
      ...partial,
    }
  }

  it('appends an add addressed at the list, removes bottom-up, and reorders in place', () => {
    const applied = applyChanges(content, [
      change({ kind: 'add', path: 'experience[0].bullets', now: 'Ran the payments on-call rota' }),
      change({ kind: 'remove', path: 'experience[1].bullets[2]' }),
      change({
        kind: 'reorder',
        path: 'skills[0].items',
        now: 'TypeScript · Go · Python · SQL',
      }),
    ])

    expect(applied.experience[0].bullets.at(-1)).toBe('Ran the payments on-call rota')
    expect(applied.experience[1].bullets).toHaveLength(2)
    expect(applied.experience[1].bullets).not.toContain(content.experience[1].bullets[2])
    expect(applied.skills[0].items).toEqual(['TypeScript', 'Go', 'Python', 'SQL'])
  })

  it('skips a path that leads nowhere rather than inventing structure', () => {
    const applied = applyChanges(content, [
      change({ kind: 'edit', path: 'experience[9].bullets[0]', now: 'Invented job' }),
      change({ kind: 'reorder', path: 'skills[0].items', now: 'Go · Rust' }),
    ])

    expect(applied).toEqual(content)
  })

  it('drops a refused change even when a caller hands it one', () => {
    const applied = applyChanges(content, [
      change({
        kind: 'add',
        path: 'experience[0].bullets',
        now: 'Led a 12-person team',
        status: 'refused',
        refusedReason: 'No source in your résumé.',
      }),
    ])

    expect(JSON.stringify(applied)).not.toContain('12-person team')
    expect(applied).toEqual(content)
  })
})
