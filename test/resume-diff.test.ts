import { describe, expect, it } from 'vitest'

import { semanticDiff } from '@/lib/resume/diff'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'

const base: ResumeContent = parseResumeContent({
  basics: { name: 'Alex Chen', label: 'Backend Engineer' },
  experience: [
    { company: 'Ramp', title: 'Senior Engineer', start: '2023-03', bullets: ['one', 'two', 'three'] },
    { company: 'Plaid', title: 'Engineer', start: '2020-06', end: '2023-02', bullets: ['four'] },
  ],
  skills: [{ category: 'Languages', items: ['Go', 'TypeScript'] }],
})

const edited = (mutate: (draft: ResumeContent) => void): ResumeContent => {
  const draft = structuredClone(base)
  mutate(draft)
  return draft
}

describe('semanticDiff', () => {
  it('reports an added field as an add, not an edit', () => {
    const changes = semanticDiff(
      base,
      edited((draft) => {
        draft.basics.summary = 'Six years of payments infrastructure.'
      }),
    )

    expect(changes).toEqual([
      { kind: 'add', path: 'basics.summary', now: 'Six years of payments infrastructure.' },
    ])
  })

  it('reports a cleared field as a remove', () => {
    const changes = semanticDiff(
      base,
      edited((draft) => {
        draft.basics.label = undefined
      }),
    )

    expect(changes).toEqual([{ kind: 'remove', path: 'basics.label', was: 'Backend Engineer' }])
  })

  it('matches jobs by identity, so a bullet edit is not a job swap', () => {
    const changes = semanticDiff(
      base,
      edited((draft) => {
        draft.experience[0].bullets[1] = 'two, rewritten'
      }),
    )

    expect(changes).toEqual([
      { kind: 'edit', path: 'experience[0].bullets[1]', was: 'two', now: 'two, rewritten' },
    ])
  })

  it('sees a moved job as a reorder rather than a remove and an add', () => {
    const changes = semanticDiff(
      base,
      edited((draft) => {
        draft.experience.reverse()
      }),
    )

    expect(changes.map((change) => change.kind)).toEqual(['reorder'])
    expect(changes[0].path).toBe('experience')
  })

  it('reports a genuinely new job as an add and a deleted one as a remove', () => {
    const changes = semanticDiff(
      base,
      edited((draft) => {
        draft.experience.splice(1, 1)
        draft.experience.push({
          company: 'Stripe',
          title: 'Staff Engineer',
          location: undefined,
          start: undefined,
          end: undefined,
          bullets: [],
        })
      }),
    )

    expect(changes).toContainEqual({
      kind: 'add',
      path: 'experience[1]',
      now: 'Staff Engineer — Stripe',
    })
    expect(changes).toContainEqual({
      kind: 'remove',
      path: 'experience[1]',
      was: 'Engineer — Plaid',
    })
  })

  it('walks into skill groups by category', () => {
    const changes = semanticDiff(
      base,
      edited((draft) => {
        draft.skills[0].items.push('Rust')
      }),
    )

    expect(changes).toEqual([{ kind: 'add', path: 'skills[0].items[2]', now: 'Rust' }])
  })

  it('is empty when nothing moved', () => {
    expect(semanticDiff(base, structuredClone(base))).toEqual([])
  })
})
