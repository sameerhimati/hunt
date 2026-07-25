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
