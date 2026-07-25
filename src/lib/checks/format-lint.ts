import type { ResumeContent } from '@/lib/resume/schema'

import type { CheckOutcome, CheckRunInput, FormatIssue, FormatLintDetail } from './types'

/**
 * Format lint — objective rules only.
 *
 * Every rule here measures something the user can go and count for themselves:
 * words in a bullet, the shape of a date string, the first word of a line, two
 * lines that are the same line. Nothing in this file has an opinion about
 * *content* — no "weak verb", no "quantify this", no house style — because a
 * lint the user disagrees with must at least be a fact they can check, and a
 * lint that reads as taste teaches them to close the panel.
 *
 * The clean fixture must lint to `[]`. Thresholds are therefore calibrated
 * against a real, well-written résumé (`gates/fixtures/resume/alex-chen.json`,
 * longest bullet 19 words) rather than against an ideal: a check that always
 * finds something is noise. When in doubt a rule stays out — which is why
 * "tense consistency" is not here, since deciding that `Own` and `Designed`
 * clash requires a parser we don't have and a judgement we shouldn't make.
 *
 * `detail` is one plain sentence naming what was measured and where, with the
 * résumé path in it so the panel can deep-link the fix. Instrument reading,
 * never a grade.
 */

/**
 * A bullet past this many words has stopped being a bullet. Alex Chen's
 * longest real bullet is 19 words; the headroom is deliberate so only a genuine
 * run-on trips the rule.
 */
const MAX_BULLET_WORDS = 32

/**
 * Bullet openers that put the writer in the sentence. Anchored to the start and
 * word-bounded on purpose: `Mentor two mid-level engineers` is an imperative,
 * `Improved…` contains no pronoun, and neither may be flagged.
 */
const FIRST_PERSON = /^(i['’](m|ve|d|ll)|i|my|mine|me)\b/i

const ONGOING = new Set(['present', 'current', 'now', 'ongoing', 'to date'])

type DateShape = 'iso' | 'month-name' | 'slashed' | 'other'

const DATE_SHAPES: { shape: DateShape; test: RegExp; example: string }[] = [
  { shape: 'iso', test: /^\d{4}(-\d{1,2})?$/, example: '2023-03' },
  { shape: 'month-name', test: /^[A-Za-z]{3,9}\.?\s+\d{4}$/, example: 'June 2020' },
  { shape: 'slashed', test: /^\d{1,2}\/\d{4}$/, example: '06/2020' },
]

interface Bullet {
  path: string
  text: string
}

interface DatedField {
  path: string
  text: string
  shape: DateShape
}

export function lintFormat(content: ResumeContent): FormatIssue[] {
  const bullets = collectBullets(content)

  return [
    ...tooLongBullets(bullets),
    ...firstPersonBullets(bullets),
    ...duplicateBullets(bullets),
    ...mixedTrailingPunctuation(bullets),
    ...mixedDateFormats(collectDates(content)),
    ...emptySections(content),
  ]
}

/** Runner slot: reports `clean` or `N issues`. */
export function runFormatLint(input: CheckRunInput): Promise<CheckOutcome> {
  const issues = lintFormat(input.version.content)
  const details: FormatLintDetail = { issues }

  return Promise.resolve({
    kind: 'format_lint',
    // Never `fail`: a formatting observation is a reading, not a rejection.
    verdict: issues.length === 0 ? 'pass' : 'warn',
    summary: issues.length === 0 ? 'clean' : `${issues.length} ${plural(issues.length, 'issue')}`,
    details,
  })
}

/* ── rules ─────────────────────────────────────────────────────────────── */

function tooLongBullets(bullets: Bullet[]): FormatIssue[] {
  return bullets.flatMap((bullet) => {
    const words = countWords(bullet.text)
    if (words <= MAX_BULLET_WORDS) return []

    return [
      {
        code: 'bullet-too-long',
        path: bullet.path,
        detail: `${bullet.path} runs ${words} words; past ${MAX_BULLET_WORDS} a bullet wraps to three or more lines on the page.`,
      },
    ]
  })
}

function firstPersonBullets(bullets: Bullet[]): FormatIssue[] {
  return bullets.flatMap((bullet) => {
    const match = FIRST_PERSON.exec(bullet.text.trim())
    if (!match) return []

    return [
      {
        code: 'first-person',
        path: bullet.path,
        detail: `${bullet.path} opens with “${match[0]}”; every other bullet starts with a verb.`,
      },
    ]
  })
}

function duplicateBullets(bullets: Bullet[]): FormatIssue[] {
  const seen = new Map<string, string>()

  return bullets.flatMap((bullet) => {
    const key = normalizeBullet(bullet.text)
    if (!key) return []

    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, bullet.path)
      return []
    }

    return [
      {
        code: 'duplicate-bullet',
        path: bullet.path,
        detail: `${bullet.path} repeats the text already at ${first}, word for word.`,
      },
    ]
  })
}

/**
 * Some bullets ending in a period and others not is a fact about the document,
 * checkable at a glance. Which convention is "right" is not our business, so
 * the minority group is the one named and the user's own habit wins.
 */
function mixedTrailingPunctuation(bullets: Bullet[]): FormatIssue[] {
  const withPeriod = bullets.filter((bullet) => bullet.text.trim().endsWith('.'))
  const without = bullets.filter((bullet) => !bullet.text.trim().endsWith('.'))
  if (withPeriod.length === 0 || without.length === 0) return []

  const flagged = withPeriod.length <= without.length ? withPeriod : without
  const majority = Math.max(withPeriod.length, without.length)
  const ends = flagged === withPeriod ? 'ends with a period' : 'ends without a period'
  const majorityEnds = flagged === withPeriod ? 'without one' : 'with one'

  return flagged.map((bullet) => ({
    code: 'trailing-punctuation-mixed',
    path: bullet.path,
    detail: `${bullet.path} ${ends}, while ${majority} other ${plural(majority, 'bullet')} end ${majorityEnds}.`,
  }))
}

/**
 * Compares the *shape* of every start/end date in the document. `2014` and
 * `2023-03` are the same convention written to different precision, so they do
 * not clash; `June 2020` beside `2023-03` does.
 */
function mixedDateFormats(dates: DatedField[]): FormatIssue[] {
  if (dates.length < 2) return []

  const counts = new Map<DateShape, number>()
  for (const date of dates) counts.set(date.shape, (counts.get(date.shape) ?? 0) + 1)
  if (counts.size < 2) return []

  const dominant = [...counts.entries()].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  )[0]
  const example = dates.find((date) => date.shape === dominant)?.text ?? exampleOf(dominant)

  return dates
    .filter((date) => date.shape !== dominant)
    .map((date) => ({
      code: 'date-format-mixed',
      path: date.path,
      detail: `${date.path} reads “${date.text}” while ${counts.get(dominant)} other dates use the “${example}” form.`,
    }))
}

/** A heading with nothing under it is a hole in the page, not a style choice. */
function emptySections(content: ResumeContent): FormatIssue[] {
  const issues: FormatIssue[] = []

  content.experience.forEach((entry, index) => {
    if (entry.bullets.length > 0) return
    issues.push({
      code: 'empty-section',
      path: `experience[${index}]`,
      detail: `experience[${index}] (${entry.company || 'untitled role'}) lists no bullets, so it prints as a heading with nothing under it.`,
    })
  })

  content.projects.forEach((entry, index) => {
    if (entry.bullets.length > 0 || entry.description) return
    issues.push({
      code: 'empty-section',
      path: `projects[${index}]`,
      detail: `projects[${index}] (${entry.name || 'untitled project'}) has no description and no bullets.`,
    })
  })

  content.skills.forEach((group, index) => {
    if (group.items.length > 0) return
    issues.push({
      code: 'empty-section',
      path: `skills[${index}]`,
      detail: `skills[${index}] (${group.category || 'untitled group'}) lists no items.`,
    })
  })

  content.custom.forEach((section, index) => {
    if (section.bullets.length > 0) return
    issues.push({
      code: 'empty-section',
      path: `custom[${index}]`,
      detail: `custom[${index}] (${section.title || 'untitled section'}) lists no lines.`,
    })
  })

  return issues
}

/* ── collection ────────────────────────────────────────────────────────── */

function collectBullets(content: ResumeContent): Bullet[] {
  const bullets: Bullet[] = []

  const push = (prefix: string, list: readonly string[]) => {
    list.forEach((text, index) => {
      if (text.trim()) bullets.push({ path: `${prefix}.bullets[${index}]`, text })
    })
  }

  content.experience.forEach((entry, index) => push(`experience[${index}]`, entry.bullets))
  content.education.forEach((entry, index) => push(`education[${index}]`, entry.bullets))
  content.projects.forEach((entry, index) => push(`projects[${index}]`, entry.bullets))
  content.custom.forEach((section, index) => push(`custom[${index}]`, section.bullets))

  return bullets
}

function collectDates(content: ResumeContent): DatedField[] {
  const dates: DatedField[] = []

  const push = (path: string, value: string | undefined) => {
    const text = value?.trim()
    if (!text || ONGOING.has(text.toLowerCase())) return
    dates.push({ path, text, shape: shapeOf(text) })
  }

  content.experience.forEach((entry, index) => {
    push(`experience[${index}].start`, entry.start)
    push(`experience[${index}].end`, entry.end)
  })
  content.education.forEach((entry, index) => {
    push(`education[${index}].start`, entry.start)
    push(`education[${index}].end`, entry.end)
  })

  return dates
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function shapeOf(text: string): DateShape {
  return DATE_SHAPES.find((candidate) => candidate.test.test(text))?.shape ?? 'other'
}

function exampleOf(shape: DateShape): string {
  return DATE_SHAPES.find((candidate) => candidate.shape === shape)?.example ?? shape
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function normalizeBullet(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}
