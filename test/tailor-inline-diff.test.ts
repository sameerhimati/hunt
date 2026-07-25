import { describe, expect, it } from 'vitest'

import { inlineDiff, type InlineDiffSegment } from '@/lib/tailor/inline-diff'

/**
 * The diff is what the reviewer actually reads, so the properties matter more
 * than any one expected shape: nothing may be invented, nothing may be lost,
 * and no highlight may cut a word in half.
 */

const WORD = /[\p{L}\p{N}]/u

/** The text a reader reconstructs from the segments they can see, per side. */
function side(segments: InlineDiffSegment[], keep: 'del' | 'add'): string {
  return segments
    .filter((segment) => segment.type === 'same' || segment.type === keep)
    .map((segment) => segment.text)
    .join('')
}

/** Whitespace is repositioned by design; word content is not. */
function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function expectFidelity(was: string, now: string) {
  const segments = inlineDiff(was, now)
  expect(words(side(segments, 'del'))).toEqual(words(was))
  expect(words(side(segments, 'add'))).toEqual(words(now))
  return segments
}

describe('inlineDiff', () => {
  it('reports no change at all when the text is identical', () => {
    expect(inlineDiff('Cut p99 latency 38%.', 'Cut p99 latency 38%.')).toEqual([
      { type: 'same', text: 'Cut p99 latency 38%.' },
    ])
  })

  it('treats a missing original as a pure insertion — one add, no phantom deletion', () => {
    const bullet = 'Scaled the ledger service to 10x volume.'

    for (const was of [null, undefined, '']) {
      expect(inlineDiff(was, bullet)).toEqual([{ type: 'add', text: bullet }])
    }
  })

  it('treats a missing proposal as a pure removal', () => {
    expect(inlineDiff('Mentored two junior engineers.', '')).toEqual([
      { type: 'del', text: 'Mentored two junior engineers.' },
    ])
  })

  it('says nothing at all when both sides are empty', () => {
    expect(inlineDiff('', '')).toEqual([])
    expect(inlineDiff(null, undefined)).toEqual([])
  })

  it('highlights only the words that moved, keeping the shared prefix untouched', () => {
    const segments = expectFidelity(
      'Built internal REST APIs used across the org.',
      'Built internal REST APIs powering the billing platform at scale.',
    )

    expect(segments[0]).toEqual({ type: 'same', text: 'Built internal REST APIs ' })
    expect(segments.some((segment) => segment.type === 'del' && segment.text.includes('used'))).toBe(
      true,
    )
    expect(
      segments.some((segment) => segment.type === 'add' && segment.text.includes('billing')),
    ).toBe(true)
  })

  it('never splits a word — a reworded word is replaced whole, not patched by suffix', () => {
    const segments = expectFidelity('Cut latency by sharding', 'Cutting latency by sharding')

    expect(segments).toEqual([
      { type: 'del', text: 'Cut' },
      { type: 'add', text: 'Cutting' },
      { type: 'same', text: ' latency by sharding' },
    ])
  })

  it('keeps every highlight on whole-word boundaries across a heavy reword', () => {
    const segments = expectFidelity(
      'Improved database performance by sharding the ledger service.',
      'Cut p99 latency 38% by sharding the ledger service.',
    )

    for (const segment of segments) {
      if (segment.type === 'same') continue

      // A highlight starts and ends on a word (or is punctuation on its own) —
      // it never begins mid-token or carries the gap next to it.
      expect(segment.text).toBe(segment.text.trim())
      expect(segment.text.length).toBeGreaterThan(0)
    }

    const changed = segments.filter((segment) => segment.type !== 'same')
    expect(changed.some((segment) => WORD.test(segment.text))).toBe(true)
  })

  it('diffs punctuation on its own, leaving the word it was attached to alone', () => {
    const segments = expectFidelity(
      'Shipped the ledger service.',
      'Shipped the ledger service!',
    )

    expect(segments).toEqual([
      { type: 'same', text: 'Shipped the ledger service' },
      { type: 'del', text: '.' },
      { type: 'add', text: '!' },
    ])
  })

  it('keeps punctuation-bearing tokens whole when they are unchanged', () => {
    const segments = expectFidelity(
      'Cut p99 latency 38% at Ramp',
      'Cut p99 latency 38% at Stripe',
    )

    expect(segments).toEqual([
      { type: 'same', text: 'Cut p99 latency 38% at ' },
      { type: 'del', text: 'Ramp' },
      { type: 'add', text: 'Stripe' },
    ])
  })

  it('reports a mid-sentence insertion as one addition with no deletion', () => {
    const segments = expectFidelity('Built APIs at scale', 'Built internal REST APIs at scale')

    expect(segments.filter((segment) => segment.type === 'del')).toEqual([])
    expect(segments.filter((segment) => segment.type === 'add')).toEqual([
      { type: 'add', text: 'internal REST' },
    ])
  })

  it('reports a mid-sentence deletion as one deletion with no addition', () => {
    const segments = expectFidelity('Built internal REST APIs at scale', 'Built APIs at scale')

    expect(segments.filter((segment) => segment.type === 'add')).toEqual([])
    expect(segments.filter((segment) => segment.type === 'del')).toEqual([
      { type: 'del', text: 'internal REST' },
    ])
  })

  it('does not double the gap where a deletion and an insertion meet', () => {
    for (const segments of [
      expectFidelity('Improved database performance', 'Cut p99 latency'),
      expectFidelity('a b c', 'a c'),
      expectFidelity('a c', 'a b c'),
    ]) {
      expect(segments.map((segment) => segment.text).join('')).not.toMatch(/ {2}/)
    }
  })

  it('preserves the fidelity contract on a full tailored bullet', () => {
    expectFidelity(
      'Reduced p99 from 210ms to 130ms after sharding the balance-read path',
      "Cut p99 latency from 210ms to 130ms by sharding the balance-read path — the exact reliability work Stripe's charge-path SLOs demand",
    )
  })

  it('degrades to one struck block against one new block past the review threshold', () => {
    const was = Array.from({ length: 900 }, (_, index) => `alpha${index}`).join(' ')
    const now = Array.from({ length: 900 }, (_, index) => `beta${index}`).join(' ')

    expect(inlineDiff(was, now)).toEqual([
      { type: 'del', text: was },
      { type: 'add', text: now },
    ])
  })
})
