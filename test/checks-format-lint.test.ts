import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { lintFormat, runFormatLint } from '@/lib/checks/format-lint'
import type { FormatLintDetail } from '@/lib/checks/types'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'

const alexChen = parseResumeContent(
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'), 'utf8'),
  ),
)

function clone(): ResumeContent {
  return structuredClone(alexChen)
}

function codesFor(content: ResumeContent): string[] {
  return lintFormat(content).map((issue) => issue.code)
}

function codesAt(content: ResumeContent, now: Date): string[] {
  return lintFormat(content, now).map((issue) => issue.code)
}

describe('lintFormat on a real résumé', () => {
  it('finds nothing to say about the clean fixture', () => {
    expect(lintFormat(alexChen)).toEqual([])
  })

  it('stays quiet on an empty document', () => {
    expect(lintFormat(parseResumeContent({ basics: { name: 'Nobody' } }))).toEqual([])
  })
})

describe('bullet-too-long', () => {
  it('flags a run-on bullet and names the count and the path', () => {
    const content = clone()
    content.experience[0].bullets.push(
      'Architected, designed, implemented, deployed, monitored, and maintained an extremely large number of microservices across a wide variety of business domains while collaborating cross-functionally with many stakeholders to deliver value at scale over a sustained period of time',
    )

    const issue = lintFormat(content).find((candidate) => candidate.code === 'bullet-too-long')
    expect(issue?.path).toBe('experience[0].bullets[5]')
    expect(issue?.detail).toContain('experience[0].bullets[5]')
    expect(issue?.detail).toMatch(/runs \d+ words/)
  })

  it('leaves the longest real bullet alone', () => {
    const longest = Math.max(
      ...alexChen.experience.flatMap((entry) =>
        entry.bullets.map((bullet) => bullet.split(/\s+/).length),
      ),
    )
    expect(longest).toBeLessThan(32)
    expect(codesFor(alexChen)).not.toContain('bullet-too-long')
  })
})

describe('first-person', () => {
  it('flags a bullet that opens with a pronoun', () => {
    const content = clone()
    content.experience[0].bullets.push('I personally architected the billing platform')
    content.experience[1].bullets.push("I'm the owner of the sync pipeline")
    content.projects[0].bullets.push('My library ships in three production stacks')

    expect(codesFor(content).filter((code) => code === 'first-person')).toHaveLength(3)
  })

  it('does not mistake an imperative or a word starting with i for first person', () => {
    const content = clone()
    content.experience[1].bullets.push('Improved index selection for the ledger read path')
    content.experience[1].bullets.push('Mentor two mid-level engineers')

    expect(codesFor(content)).not.toContain('first-person')
  })
})

describe('date-format-mixed', () => {
  it('flags a month-name date beside ISO dates and cites the odd one', () => {
    const content = clone()
    content.experience[1].start = 'June 2020'

    const issues = lintFormat(content).filter((issue) => issue.code === 'date-format-mixed')
    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('experience[1].start')
    expect(issues[0].detail).toContain('June 2020')
  })

  it('treats a bare year and a year-month as the same convention', () => {
    // The clean fixture already mixes `2014` (education) with `2023-03` (experience).
    expect(codesFor(alexChen)).not.toContain('date-format-mixed')
  })

  it('ignores an open-ended role', () => {
    const content = clone()
    content.experience[0].end = 'Present'
    expect(codesFor(content)).not.toContain('date-format-mixed')
  })

  it('is quiet when every date uses the month-name form', () => {
    const content = clone()
    content.experience[0].start = 'March 2023'
    content.experience[1].start = 'June 2020'
    content.experience[1].end = 'February 2023'
    content.education[0].start = 'September 2014'
    content.education[0].end = 'June 2018'

    expect(codesFor(content)).not.toContain('date-format-mixed')
  })
})

describe('the secondary objective rules', () => {
  it('flags a bullet repeated word for word', () => {
    const content = clone()
    content.experience[1].bullets.push(content.experience[0].bullets[0])

    const issue = lintFormat(content).find((candidate) => candidate.code === 'duplicate-bullet')
    expect(issue?.path).toBe('experience[1].bullets[3]')
    expect(issue?.detail).toContain('experience[0].bullets[0]')
  })

  it('flags the minority trailing-punctuation style, not the majority', () => {
    const content = clone()
    content.experience[1].bullets[0] = `${content.experience[1].bullets[0]}.`

    const issues = lintFormat(content).filter(
      (issue) => issue.code === 'trailing-punctuation-mixed',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('experience[1].bullets[0]')
  })

  it('flags a role, skill group or custom section with nothing under it', () => {
    const content = clone()
    content.experience[0].bullets = []
    content.skills[0].items = []
    content.custom.push({ title: 'Awards', bullets: [] })

    const issues = lintFormat(content).filter((issue) => issue.code === 'empty-section')
    expect(issues.map((issue) => issue.path)).toEqual(['experience[0]', 'skills[0]', 'custom[0]'])
  })
})

describe('runFormatLint', () => {
  it('reports the clean fixture as clean, with no score anywhere', async () => {
    const outcome = await runFormatLint({ version: { content: alexChen } })

    expect(outcome.kind).toBe('format_lint')
    expect(outcome.verdict).toBe('pass')
    expect(outcome.summary).toBe('clean')
    expect((outcome.details as FormatLintDetail).issues).toEqual([])
    expect(JSON.stringify(outcome)).not.toMatch(/score|percentage|grade/i)
  })

  it('counts the issues it found and never fails the document', async () => {
    const content = clone()
    content.experience[0].bullets.push('I owned the ledger')
    content.experience[1].start = 'June 2020'

    const outcome = await runFormatLint({ version: { content } })
    const issues = (outcome.details as FormatLintDetail).issues

    expect(outcome.verdict).toBe('warn')
    expect(outcome.summary).toBe(`${issues.length} issues`)
    expect(issues.every((issue) => issue.detail.includes(issue.path))).toBe(true)
  })
})

/**
 * The clock is pinned in every one of these. The rule's whole subject is elapsed
 * time, so a test that used the real date would assert something different every
 * month it ran.
 */
describe('stale-end-date', () => {
  const NOW = new Date('2026-08-03T00:00:00Z')

  /** Ends every role, so the document has a last date rather than a current one. */
  function ending(end: string): ResumeContent {
    const content = clone()
    content.experience[0].end = end
    content.experience[1].end = '2020-05'
    return content
  }

  it('says nothing about the clean fixture, whose latest role is ongoing', () => {
    expect(lintFormat(alexChen, NOW)).toEqual([])
  })

  it('is silent however far in the future the clock runs, while a role is current', () => {
    expect(lintFormat(alexChen, new Date('2044-01-01T00:00:00Z'))).toEqual([])
  })

  it('flags a résumé whose last role ended years ago', () => {
    const [issue] = lintFormat(ending('2021-03'), NOW).filter(
      (found) => found.code === 'stale-end-date',
    )

    expect(issue.path).toBe('experience[0].end')
    expect(issue.detail).toContain('2021-03')
    expect(issue.detail).toContain('5 years ago')
  })

  it('names the latest end date, not the first or last entry in the array', () => {
    const content = clone()
    content.experience[0].end = '2019-01'
    content.experience[1].end = '2021-06'

    const [issue] = lintFormat(content, NOW).filter((found) => found.code === 'stale-end-date')

    expect(issue.path).toBe('experience[1].end')
    expect(issue.detail).toContain('2021-06')
  })

  it('never suggests the user account for the gap, only that they name it', () => {
    const [issue] = lintFormat(ending('2021-03'), NOW).filter(
      (found) => found.code === 'stale-end-date',
    )

    expect(issue.detail).toMatch(/saves the reader guessing/)
    expect(issue.detail).not.toMatch(/employment gap|explain|unemployed|why/i)
  })

  it('holds its tongue inside the grace window', () => {
    // Eighteen months back to the month: recent enough to be an ordinary search.
    expect(codesAt(ending('2025-02'), NOW)).not.toContain('stale-end-date')
    expect(codesAt(ending('2025-01'), NOW)).toContain('stale-end-date')
  })

  it.each(['Present', 'present', 'current', 'Ongoing', ''])(
    'treats %o as a role still in progress',
    (end) => {
      expect(codesAt(ending(end), NOW)).not.toContain('stale-end-date')
    },
  )

  it.each([
    ['June 2021', 'month-name'],
    ['Jun. 2021', 'abbreviated month'],
    ['06/2021', 'slashed'],
    ['2021-06', 'iso'],
  ])('reads %o (%s) as the same date', (end) => {
    expect(codesAt(ending(end), NOW)).toContain('stale-end-date')
  })

  it('reads a bare year as December, the reading kindest to the user', () => {
    // Dec 2024 is 20 months before Aug 2026 and flags; Dec 2025 is 8 and does not.
    expect(codesAt(ending('2024'), NOW)).toContain('stale-end-date')
    expect(codesAt(ending('2025'), NOW)).not.toContain('stale-end-date')
  })

  it('does not guess at a date it cannot read', () => {
    expect(codesAt(ending("Summer '21"), NOW)).not.toContain('stale-end-date')
  })

  it('does not count education, which is supposed to be in the past', () => {
    const content = clone()
    content.education[0].end = '2011'

    expect(codesAt(content, NOW)).not.toContain('stale-end-date')
  })
})

describe('skills-undifferentiated', () => {
  it('leaves the clean fixture alone — six items in a group sorts fine', () => {
    expect(codesFor(alexChen)).not.toContain('skills-undifferentiated')
  })

  it('flags one group carrying more than it sorts', () => {
    const content = clone()
    content.skills[0].items = Array.from({ length: 18 }, (_, index) => `Lang${index}`)

    const [issue] = lintFormat(content).filter(
      (found) => found.code === 'skills-undifferentiated',
    )

    expect(issue.path).toBe('skills[0]')
    expect(issue.detail).toContain('18 items')
    expect(issue.detail).toContain('Languages')
  })

  /** Ranking them would be a proficiency claim the document never made. */
  it('asks the user to split or cut, never telling them which they are expert in', () => {
    const content = clone()
    content.skills[0].items = Array.from({ length: 18 }, (_, index) => `Lang${index}`)

    const [issue] = lintFormat(content).filter(
      (found) => found.code === 'skills-undifferentiated',
    )

    expect(issue.detail).toMatch(/splitting it, or cutting/)
    expect(issue.detail).not.toMatch(/expert|proficien|advanced|beginner|rate/i)
  })

  it('counts each group on its own, not the document total', () => {
    const content = clone()
    content.skills = content.skills.map((group) => ({ ...group, items: group.items.slice(0, 5) }))

    expect(codesFor(content)).not.toContain('skills-undifferentiated')
  })
})
