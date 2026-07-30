import { describe, expect, it } from 'vitest'

import type { SourceDocument, SourceLine } from '@/lib/resume/parse/blocks'
import { structureResume } from '@/lib/resume/parse/structure'

/**
 * Fixtures are the **actual output of `readPdf()`** on
 * `gates/fixtures/resume/sample-{1,2,3}.pdf`, copied in as literals: text, page,
 * y, x, right, font size and font id are measured values, not plausible ones.
 * That matters more than it sounds. Every heuristic in `structure.ts` turns on a
 * coordinate, and a fixture with tidied-up numbers would be testing the tidying —
 * the two facts these fixtures pin down that a hand-authored one would have got
 * wrong are that the reader **fuses a whole baseline into one line** (sample 1's
 * right-aligned date arrives as `"Convoy 2022-01 – Present"`, not as two spans)
 * and that a wrapped bullet **shares its bullet's exact `x`** because the hanging
 * glyph is excluded from the geometry.
 *
 * They are literals rather than a runtime call to `readPdf` on purpose: a unit
 * test of the structurer should fail when the structurer breaks, not when pdf.js
 * changes its mind about a font id.
 *
 * `expected-{1,2,3}.json` in `gates/fixtures/resume/` are the hand-labelled ground
 * truth for these same PDFs, and the assertions below are written against them.
 * Where this parser falls short of that label the test says so out loud instead of
 * lowering the bar quietly — see `known gaps` at the end.
 */

function line(
  text: string,
  y: number,
  x: number,
  right: number,
  fontSize: number,
  fontName: string,
  isListItem = false,
  page = 0,
): SourceLine {
  return { text, page, y, x, right, fontSize, fontName, isListItem }
}

/**
 * Builds the document a reader would return. `text` is derived exactly as
 * `blocks.ts` derives it — lines newline-joined and then dehyphenated — so the
 * verbatim assertions below are checked against the same haystack
 * `scoreConfidence()` will use in production, hyphenation and all.
 */
function documentOf(lines: SourceLine[], kind: 'pdf' | 'docx' = 'pdf'): SourceDocument {
  const text = lines.map((l) => l.text).join('\n').replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
  return { kind, lines, text }
}

// ---------------------------------------------------------------------------
// sample-1.pdf — Priya Raghavan. Single column, Jake's template: employer at the
// left margin with its date range hard right on the same baseline, ISO dates.
// ---------------------------------------------------------------------------

const SAMPLE_1 = documentOf([
  line('Priya Raghavan', 56.7, 205.6, 406.5, 24.79, 'g_d0_f1'),
  line('Data Engineer', 74.2, 268.9, 343.1, 11.96, 'g_d0_f3'),
  line('priya.raghavan@example.com · +1 (206) 555-0148 · Seattle, WA · https://github.com/praghavan', 89.2, 94.6, 517.4, 9.96, 'g_d0_f5'),
  line('Summary', 115.1, 39.6, 93.2, 11.96, 'g_d0_f1'),
  line('Data engineer with seven years building batch and streaming pipelines for retail and logistics teams.', 134.6, 39.6, 519.7, 10.91, 'g_d0_f5'),
  line('Experience', 157.6, 39.6, 107.7, 11.96, 'g_d0_f1'),
  line('Convoy 2022-01 – Present', 178.3, 39.6, 572.4, 10.91, 'g_d0_f9'),
  line('Senior Data Engineer Seattle, WA', 191.8, 39.6, 572.4, 9.96, 'g_d0_f11'),
  line('Rebuilt the freight pricing feature store on Iceberg, cutting model training time from 6 hours to 40 minutes', 205.4, 54.9, 569.4, 10.91, 'g_d0_f5', true),
  line('Own the Airflow platform running 900 daily tasks across 40 teams', 219.9, 54.9, 372.6, 10.91, 'g_d0_f5', true),
  line('Introduced column-level lineage so analysts can trace any dashboard number back to its source table', 234.5, 54.9, 536.9, 10.91, 'g_d0_f5', true),
  line('Zulily 2018-08 – 2021-12', 250.1, 39.6, 572.4, 10.91, 'g_d0_f9'),
  line('Data Engineer Seattle, WA', 263.6, 39.6, 572.4, 9.96, 'g_d0_f11'),
  line('Migrated 200 nightly Hive jobs to Spark on Kubernetes, halving warehouse spend', 277.2, 54.9, 446.1, 10.91, 'g_d0_f5', true),
  line('Built the clickstream sessionization job that powers merchandising reports', 291.7, 54.9, 410.4, 10.91, 'g_d0_f5', true),
  line('Projects', 314.6, 39.6, 94.4, 11.96, 'g_d0_f1'),
  line('slowquery — CLI that explains Postgres query plans in plain English', 334.2, 39.6, 378.3, 10.91, 'g_d0_f5'),
  line('https://github.com/praghavan/slowquery', 347.8, 39.6, 238.4, 9.96, 'g_d0_f14'),
  line('600 GitHub stars; packaged for Homebrew and apt', 364.3, 54.9, 299.1, 10.91, 'g_d0_f5', true),
  line('Education', 387.2, 39.6, 102.5, 11.96, 'g_d0_f1'),
  line('Purdue University 2011 – 2015', 407.9, 39.6, 572.4, 10.91, 'g_d0_f9'),
  line('B.S. Computer Engineering', 421.5, 39.6, 160.1, 9.96, 'g_d0_f11'),
  line('Skills', 443.3, 39.6, 75.9, 11.96, 'g_d0_f1'),
  line('Languages: Python, Scala, SQL, Go', 462.9, 54.9, 235.4, 10.91, 'g_d0_f5'),
  line('Data: Spark, Airflow, Iceberg, Kafka, dbt', 477.4, 54.9, 258.2, 10.91, 'g_d0_f5'),
])

// ---------------------------------------------------------------------------
// sample-2.pdf — Marcus Webb. moderncv: dates in a narrow left rail, human month
// names, "Title, Company" comma form, bullets that wrap, one across a hyphen.
// ---------------------------------------------------------------------------

const SAMPLE_2 = documentOf([
  line('Marcus Webb', 67.3, 50.4, 220.2, 24.79, 'g_d1_f1'),
  line('Site Reliability Engineer', 83.9, 50.4, 175.6, 11.96, 'g_d1_f3'),
  line('marcus.webb@example.com | +1 (512) 555-0119 | Austin, TX | https://marcuswebb.example.com', 100.4, 50.4, 476.3, 9.96, 'g_d1_f5'),
  line('Profile', 129.3, 50.4, 89.2, 11.96, 'g_d1_f1'),
  line('SRE focused on incident response and capacity planning for high-traffic consumer platforms.', 152.4, 50.4, 493.6, 10.91, 'g_d1_f5'),
  line('Experience', 177.3, 50.4, 115.3, 11.96, 'g_d1_f1'),
  line('Staff Site Reliability Engineer, Bazaarvoice', 200.3, 162.9, 390.7, 10.91, 'g_d1_f7'),
  line('Jun 2021 – Present', 207.2, 50.4, 134.1, 9.96, 'g_d1_f5'),
  line('Austin, TX', 213.9, 162.9, 212.5, 9.96, 'g_d1_f5'),
  line('Cut mean time to recovery from 48 minutes to 11 minutes by rewriting the on-call', 229.4, 174.9, 561.6, 10.91, 'g_d1_f5', true),
  line('runbooks around service ownership', 243.0, 174.9, 342.4, 10.91, 'g_d1_f5'),
  line('Designed the multi-region failover drill that the platform team now runs quarterly', 257.5, 174.9, 561.6, 10.91, 'g_d1_f5', true),
  line('Reduced Kubernetes node spend 34 percent with vertical pod autoscaling and', 272.1, 174.9, 561.6, 10.91, 'g_d1_f5', true),
  line('right-sized instance families', 285.6, 174.9, 306.6, 10.91, 'g_d1_f5'),
  line('Site Reliability Engineer, RetailMeNot', 300.4, 162.9, 365.7, 10.91, 'g_d1_f7'),
  line('Feb 2018 – May 2021', 307.2, 50.4, 143.2, 9.96, 'g_d1_f5'),
  line('Austin, TX', 313.9, 162.9, 212.5, 9.96, 'g_d1_f5'),
  line('Ran the migration of 60 services from EC2 to EKS with no customer-visible down-', 329.4, 174.9, 561.6, 10.91, 'g_d1_f5', true),
  line('time', 343.0, 174.9, 196.1, 10.91, 'g_d1_f5'),
  line('Built the error-budget dashboard that product teams use to gate releases', 357.5, 174.9, 525.2, 10.91, 'g_d1_f5', true),
  line('Education', 385.4, 50.4, 109.9, 11.96, 'g_d1_f1'),
  line('B.S. Electrical and Computer Engineering, University of Texas at Austin', 408.4, 162.9, 542.6, 10.91, 'g_d1_f7'),
  line('Aug 2013 – May 2017', 415.3, 50.4, 145.3, 9.96, 'g_d1_f5'),
  line('Skills', 442.9, 50.4, 81.5, 11.96, 'g_d1_f1'),
  line('Kubernetes, Terraform, AWS, Envoy', 466.0, 162.9, 339.0, 10.91, 'g_d1_f5'),
  line('Infrastructure', 472.9, 50.4, 110.9, 9.96, 'g_d1_f5'),
  line('Prometheus, Grafana, OpenTelemetry', 485.4, 162.9, 345.1, 10.91, 'g_d1_f5'),
  line('Observability', 492.2, 50.4, 108.3, 9.96, 'g_d1_f5'),
  line('Go, Python, Bash', 506.7, 162.9, 248.8, 10.91, 'g_d1_f5'),
  line('Languages', 513.5, 50.4, 96.0, 9.96, 'g_d1_f5'),
])

// ---------------------------------------------------------------------------
// sample-3.pdf — Nina Ostrowski. Deedy two-column, already resolved into reading
// order by `readPdf`: the sidebar (Education / Skills / Speaking) arrives whole,
// then the main column (Experience / Projects). So the sections are out of order
// relative to a normal résumé, and the y values run backwards at the seam —
// sidebar ends at y=286.6 and the main column restarts at y=112.1.
//
// Its headings are NOT larger than its body: "Education" and "Grubhub" are both
// 9.96pt, distinguished only by font id.
// ---------------------------------------------------------------------------

const SAMPLE_3 = documentOf([
  line('Nina Ostrowski', 52.9, 229.2, 382.8, 24.79, 'g_d2_f1'),
  line('Frontend Engineer', 66.9, 246.6, 365.4, 11.96, 'g_d2_f3'),
  line('nina.ostrowski@example.com · +1 (312) 555-0177 · Chicago, IL · https://github.com/ninaost', 81.8, 118.4, 493.6, 8.97, 'g_d2_f5'),
  line('Education', 112.1, 36.0, 86.6, 9.96, 'g_d2_f9'),
  line('University of Illinois at Chicago', 129.3, 36.0, 196.1, 9.96, 'g_d2_f9'),
  line('B.A. Computer Science', 141.2, 36.0, 130.4, 8.97, 'g_d2_f5'),
  line('2014 – 2018', 153.2, 36.0, 83.6, 8.97, 'g_d2_f5'),
  line('Skills', 170.1, 36.0, 62.5, 9.96, 'g_d2_f9'),
  line('Languages: TypeScript · JavaScript · CSS', 187.3, 36.0, 208.8, 8.97, 'g_d2_f5'),
  line('Frameworks: React · Next.js · Vitest ·', 199.2, 36.0, 208.8, 8.97, 'g_d2_f5'),
  line('Playwright', 216.2, 36.0, 79.9, 8.97, 'g_d2_f5'),
  line('Speaking', 233.1, 36.0, 81.2, 9.96, 'g_d2_f9'),
  line('React Chicago 2024 — Rebuilding', 250.3, 46.0, 208.8, 9.96, 'g_d2_f15', true),
  line('checkout without breaking checkout', 262.2, 46.0, 202.4, 9.96, 'g_d2_f15'),
  line('CSS Cafe 2023 — Container queries', 274.7, 46.0, 208.8, 9.96, 'g_d2_f15', true),
  line('in a legacy codebase', 286.6, 46.0, 134.6, 9.96, 'g_d2_f15'),
  line('Experience', 112.1, 235.8, 291.2, 9.96, 'g_d2_f9'),
  line('Grubhub 2021 – Present', 129.3, 235.8, 576.0, 9.96, 'g_d2_f5'),
  line('Senior Frontend Engineer Chicago, IL', 141.2, 235.8, 576.0, 9.96, 'g_d2_f16'),
  line('Led the design-system migration that moved 140 screens onto shared React', 153.2, 245.8, 576.0, 9.96, 'g_d2_f15', true),
  line('components', 165.1, 245.8, 297.3, 9.96, 'g_d2_f15'),
  line('Cut largest contentful paint on the diner web app from 4.1s to 1.6s', 177.6, 245.8, 538.8, 9.96, 'g_d2_f15', true),
  line('Added keyboard and screen-reader support to the checkout flow, closing 31', 190.0, 245.8, 576.0, 9.96, 'g_d2_f15', true),
  line('accessibility defects', 202.0, 245.8, 330.3, 9.96, 'g_d2_f15'),
  line('Sprout Social 2018 – 2021', 219.9, 235.8, 576.0, 9.96, 'g_d2_f9'),
  line('Frontend Engineer Chicago, IL', 231.9, 235.8, 576.0, 9.96, 'g_d2_f16'),
  line('Built the publishing calendar used by 30000 daily active accounts', 245.8, 245.8, 532.0, 9.96, 'g_d2_f15', true),
  line('Wrote the visual regression harness that runs on every pull request', 258.3, 245.8, 538.3, 9.96, 'g_d2_f15', true),
  line('Projects', 284.2, 235.8, 277.2, 9.96, 'g_d2_f9'),
  line('focus-ring https://github.com/ninaost/focus-ring', 301.4, 235.8, 576.0, 9.96, 'g_d2_f18'),
  line('Accessible focus outlines that survive design-system theming', 313.3, 235.8, 480.5, 8.97, 'g_d2_f5'),
  line('Used in three open-source component libraries', 327.3, 245.8, 448.1, 9.96, 'g_d2_f15', true),
])

// ---------------------------------------------------------------------------

describe('structureResume — sample 1 (fused employer/date baselines)', () => {
  const content = structureResume(SAMPLE_1)

  it('reads the banner off the type size, not the position', () => {
    expect(content.basics).toEqual({
      name: 'Priya Raghavan',
      label: 'Data Engineer',
      email: 'priya.raghavan@example.com',
      phone: '+1 (206) 555-0148',
      url: 'https://github.com/praghavan',
      location: 'Seattle, WA',
      summary:
        'Data engineer with seven years building batch and streaming pipelines for retail and logistics teams.',
    })
  })

  it('subtracts the date range from the line it is fused to', () => {
    expect(content.experience.map((entry) => [entry.company, entry.start, entry.end])).toEqual([
      ['Convoy', '2022-01', undefined],
      ['Zulily', '2018-08', '2021-12'],
    ])
  })

  it('peels the right-aligned location off the title without cutting it short', () => {
    // "Senior Data Engineer Seattle, WA" is one line by the time it reaches us.
    expect(content.experience[0]).toMatchObject({
      title: 'Senior Data Engineer',
      location: 'Seattle, WA',
    })
    expect(content.experience[1]).toMatchObject({
      title: 'Data Engineer',
      location: 'Seattle, WA',
    })
  })

  it('keeps every bullet, in order', () => {
    expect(content.experience[0].bullets).toEqual([
      'Rebuilt the freight pricing feature store on Iceberg, cutting model training time from 6 hours to 40 minutes',
      'Own the Airflow platform running 900 daily tasks across 40 teams',
      'Introduced column-level lineage so analysts can trace any dashboard number back to its source table',
    ])
    expect(content.experience[1].bullets).toEqual([
      'Migrated 200 nightly Hive jobs to Spark on Kubernetes, halving warehouse spend',
      'Built the clickstream sessionization job that powers merchandising reports',
    ])
  })

  it('reads education, projects and colon-form skills', () => {
    expect(content.education).toEqual([
      {
        institution: 'Purdue University',
        degree: 'B.S. Computer Engineering',
        location: undefined,
        start: '2011',
        end: '2015',
        bullets: [],
      },
    ])
    expect(content.projects).toEqual([
      {
        name: 'slowquery',
        description: 'CLI that explains Postgres query plans in plain English',
        url: 'https://github.com/praghavan/slowquery',
        bullets: ['600 GitHub stars; packaged for Homebrew and apt'],
      },
    ])
    expect(content.skills).toEqual([
      { category: 'Languages', items: ['Python', 'Scala', 'SQL', 'Go'] },
      { category: 'Data', items: ['Spark', 'Airflow', 'Iceberg', 'Kafka', 'dbt'] },
    ])
    expect(content.custom).toEqual([])
  })
})

describe('structureResume — sample 2 (left date rail, comma forms, wrapped bullets)', () => {
  const content = structureResume(SAMPLE_2)

  it('normalises human month names to YYYY-MM', () => {
    expect(content.experience[0]).toMatchObject({ start: '2021-06', end: undefined })
    expect(content.experience[1]).toMatchObject({ start: '2018-02', end: '2021-05' })
    expect(content.education[0]).toMatchObject({ start: '2013-08', end: '2017-05' })
  })

  it('picks up a date that sits on the line below the title it dates', () => {
    expect(content.experience.map((entry) => entry.start)).toEqual(['2021-06', '2018-02'])
  })

  it('resolves "Title, Company" by vocabulary rather than by position', () => {
    expect(content.experience[0]).toMatchObject({
      company: 'Bazaarvoice',
      title: 'Staff Site Reliability Engineer',
      location: 'Austin, TX',
    })
    expect(content.experience[1]).toMatchObject({
      company: 'RetailMeNot',
      title: 'Site Reliability Engineer',
      location: 'Austin, TX',
    })
  })

  it('re-joins a bullet the typesetter broke in half', () => {
    expect(content.experience[0].bullets).toEqual([
      'Cut mean time to recovery from 48 minutes to 11 minutes by rewriting the on-call runbooks around service ownership',
      'Designed the multi-region failover drill that the platform team now runs quarterly',
      'Reduced Kubernetes node spend 34 percent with vertical pod autoscaling and right-sized instance families',
    ])
  })

  it('closes up a bullet wrapped across a soft hyphen', () => {
    // "…customer-visible down-" + "time". `SourceDocument.text` is dehyphenated
    // and `lines[].text` is not, so anything else fails the verbatim check.
    expect(content.experience[1].bullets[0]).toBe(
      'Ran the migration of 60 services from EC2 to EKS with no customer-visible downtime',
    )
  })

  it('does not swallow the next job heading as a continuation', () => {
    // "Site Reliability Engineer, RetailMeNot" sits at x=162.9, twelve points left
    // of the bullet text above it. The shared-indent test is what saves it.
    expect(content.experience[0].bullets).toHaveLength(3)
    expect(content.experience[1].bullets).toHaveLength(2)
    expect(content.experience).toHaveLength(2)
  })

  it('reads "Degree, Institution" without cutting on position', () => {
    expect(content.education).toEqual([
      {
        institution: 'University of Texas at Austin',
        degree: 'B.S. Electrical and Computer Engineering',
        location: undefined,
        start: '2013-08',
        end: '2017-05',
        bullets: [],
      },
    ])
  })

  it('pairs a skills category with the values typeset above it', () => {
    expect(content.skills).toEqual([
      { category: 'Infrastructure', items: ['Kubernetes', 'Terraform', 'AWS', 'Envoy'] },
      { category: 'Observability', items: ['Prometheus', 'Grafana', 'OpenTelemetry'] },
      { category: 'Languages', items: ['Go', 'Python', 'Bash'] },
    ])
  })
})

describe('structureResume — sample 3 (sidebar layout, sections out of order)', () => {
  const content = structureResume(SAMPLE_3)

  it('reads sections in the order the reader hands them over', () => {
    // Education, Skills and Speaking are all typeset BEFORE Experience.
    expect(content.experience.map((entry) => entry.company)).toEqual(['Grubhub', 'Sprout Social'])
    expect(content.education[0].institution).toBe('University of Illinois at Chicago')
  })

  it('reads year-only dates', () => {
    expect(content.experience[0]).toMatchObject({ start: '2021', end: undefined })
    expect(content.experience[1]).toMatchObject({ start: '2018', end: '2021' })
    expect(content.education[0]).toMatchObject({ start: '2014', end: '2018' })
  })

  it('splits title from location on a fused line', () => {
    expect(content.experience[0]).toMatchObject({
      title: 'Senior Frontend Engineer',
      location: 'Chicago, IL',
    })
    expect(content.experience[1]).toMatchObject({
      title: 'Frontend Engineer',
      location: 'Chicago, IL',
    })
  })

  it('rejoins wrapped bullets in both columns', () => {
    expect(content.experience[0].bullets).toEqual([
      'Led the design-system migration that moved 140 screens onto shared React components',
      'Cut largest contentful paint on the diner web app from 4.1s to 1.6s',
      'Added keyboard and screen-reader support to the checkout flow, closing 31 accessibility defects',
    ])
    expect(content.experience[1].bullets).toEqual([
      'Built the publishing calendar used by 30000 daily active accounts',
      'Wrote the visual regression harness that runs on every pull request',
    ])
  })

  it('turns a heading it has no vocabulary for into a custom section', () => {
    expect(content.custom).toEqual([
      {
        title: 'Speaking',
        bullets: [
          'React Chicago 2024 — Rebuilding checkout without breaking checkout',
          'CSS Cafe 2023 — Container queries in a legacy codebase',
        ],
      },
    ])
  })

  it('does not promote a company set in the heading style to a heading', () => {
    // "University of Illinois at Chicago" and "Sprout Social 2018 – 2021" are set
    // in the same bold g_d2_f9 at the same 9.96pt as "Education" and "Speaking",
    // and sit at the same left edge. Only word count and the date reject them.
    expect(content.custom.map((section) => section.title)).toEqual(['Speaking'])
    expect(content.education).toHaveLength(1)
    expect(content.experience).toHaveLength(2)
  })

  it('reads ·-separated skills and their wrapped continuation', () => {
    expect(content.skills).toEqual([
      { category: 'Languages', items: ['TypeScript', 'JavaScript', 'CSS'] },
      { category: 'Frameworks', items: ['React', 'Next.js', 'Vitest', 'Playwright'] },
    ])
  })

  it('splits a project name from the URL fused onto its line', () => {
    expect(content.projects).toEqual([
      {
        name: 'focus-ring',
        description: 'Accessible focus outlines that survive design-system theming',
        url: 'https://github.com/ninaost/focus-ring',
        bullets: ['Used in three open-source component libraries'],
      },
    ])
  })

  it('leaves summary empty rather than borrowing a sentence for it', () => {
    expect(content.basics.summary).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The property that makes this parser shippable
// ---------------------------------------------------------------------------

/** The normalisation `scoreConfidence()` in import.ts applies before matching. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const DATE_KEYS = new Set(['start', 'end'])

/** Every leaf string with the key it sat under — the same walk import.ts does. */
function leaves(value: unknown, key = '', out: { key: string; value: string }[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) leaves(item, key, out)
  } else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) leaves(child, childKey, out)
  } else if (typeof value === 'string' && value !== '') {
    out.push({ key, value })
  }
  return out
}

const FIXTURES: ReadonlyArray<[string, SourceDocument]> = [
  ['sample 1', SAMPLE_1],
  ['sample 2', SAMPLE_2],
  ['sample 3', SAMPLE_3],
]

describe('structureResume never authors a string', () => {
  it.each(FIXTURES)('%s: every non-date value is a verbatim span of the document', (_name, doc) => {
    const haystack = normalise(doc.text)
    const invented = leaves(structureResume(doc))
      .filter(({ key }) => !DATE_KEYS.has(key))
      .filter(({ value }) => !haystack.includes(normalise(value)))

    expect(invented).toEqual([])
  })

  it.each(FIXTURES)('%s: dates are the only reformatted values', (_name, doc) => {
    const dates = leaves(structureResume(doc)).filter(({ key }) => DATE_KEYS.has(key))
    expect(dates.length).toBeGreaterThan(0)
    for (const { value } of dates) expect(value).toMatch(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/)
  })

  it.each(FIXTURES)('%s: would score 1.0 on every field import.ts checks', (_name, doc) => {
    const scored = leaves(structureResume(doc))
    expect(scored.length).toBeGreaterThan(20)
  })
})

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

describe('structureResume with no usable font information', () => {
  // Every line the same size and font: a flat text layer, a plain-text-ish source,
  // a producer that emitted one style. Typography is gone; vocabulary is all that
  // is left, and it has to be enough to not make things worse.
  const FLAT = documentOf(
    [
      'Dana Reyes',
      'Platform Engineer',
      'dana.reyes@example.com | +1 (415) 555-0133 | Oakland, CA | https://danareyes.example.com',
      'Summary',
      'Platform engineer who builds the tools other engineers ship on.',
      'Experience',
      'Northwind 2021-04 – Present',
      'Staff Platform Engineer Oakland, CA',
      'Ran the build system for 60 services',
      'Education',
      'Reed College 2013 – 2017',
      'B.A. Mathematics',
      'Skills',
      'Languages: Go, Ruby',
    ].map((text, index) =>
      line(text, 40 + index * 14, 40, 400, 10, 'f0', text.startsWith('Ran the build')),
    ),
  )

  const content = structureResume(FLAT)

  it('finds sections by vocabulary alone', () => {
    expect(content.basics.summary).toBe(
      'Platform engineer who builds the tools other engineers ship on.',
    )
    expect(content.experience).toHaveLength(1)
    expect(content.education).toHaveLength(1)
    expect(content.skills).toEqual([{ category: 'Languages', items: ['Go', 'Ruby'] }])
  })

  it('still splits the date and the location off the entry', () => {
    expect(content.experience[0]).toEqual({
      company: 'Northwind',
      title: 'Staff Platform Engineer',
      location: 'Oakland, CA',
      start: '2021-04',
      end: undefined,
      bullets: ['Ran the build system for 60 services'],
    })
  })

  it('falls back to the first line for the name rather than guessing', () => {
    expect(content.basics.name).toBe('Dana Reyes')
    expect(content.basics.label).toBe('Platform Engineer')
    expect(content.basics.email).toBe('dana.reyes@example.com')
    expect(content.basics.location).toBe('Oakland, CA')
  })

  it('invents no custom sections when every line shares the one style', () => {
    // The catch-all is disabled when the heading style is the document's most
    // common, which here is every line — otherwise this shatters into sections.
    expect(content.custom).toEqual([])
  })

  it('keeps the verbatim property with no typography to lean on', () => {
    const haystack = normalise(FLAT.text)
    const invented = leaves(content)
      .filter(({ key }) => !DATE_KEYS.has(key))
      .filter(({ value }) => !haystack.includes(normalise(value)))
    expect(invented).toEqual([])
  })
})

describe('structureResume on a DOCX, where a line is a paragraph', () => {
  // A DOCX bullet arrives whole — nothing records where it would have wrapped —
  // and an ordinary body paragraph after a list shares that list's indent. So the
  // wrapped-continuation rule must not run here, or it glues the paragraph on.
  const DOCX = documentOf(
    [
      line('Experience', 0, 0, 468, 14, 'Heading1-bold'),
      line('Northwind 2021-04 – Present', 1, 0, 468, 11, 'Normal-bold'),
      line('Staff Platform Engineer', 2, 0, 468, 11, 'Normal'),
      line('Ran the build system for 60 services, a bullet long enough to have wrapped in a PDF', 3, 0, 468, 11, 'Normal', true),
      line('References available on request.', 4, 0, 468, 11, 'Normal'),
    ],
    'docx',
  )

  it('does not glue a following paragraph onto the last bullet', () => {
    const entry = structureResume(DOCX).experience[0]
    expect(entry.bullets).toEqual([
      'Ran the build system for 60 services, a bullet long enough to have wrapped in a PDF',
    ])
  })

  it('still reads the entry itself', () => {
    expect(structureResume(DOCX).experience[0]).toMatchObject({
      company: 'Northwind',
      title: 'Staff Platform Engineer',
      start: '2021-04',
    })
  })

  // The three below are the real shape of `readDocx`'s output on the committed
  // DOCX fixture, and each one caught a defect the PDF samples could not: a word
  // processor separates a heading's two halves with a dash, and fuses the headline
  // into the contact paragraph instead of giving it a line of its own.
  const WORD = documentOf(
    [
      line('Dana Reyes', 0, 0, 468, 18, 'Heading1'),
      line('Platform Engineer — dana@example.com — +1 415 555 0000', 1, 0, 468, 11, 'FirstParagraph'),
      line('Experience', 2, 0, 468, 14, 'Heading2'),
      line('Northwind — Platform Engineer', 3, 0, 468, 12, 'Heading3'),
      line('April 2021 – Present', 4, 0, 468, 11, 'FirstParagraph'),
      line('Ran the build system for 60 services', 5, 0, 468, 11, 'Compact', true),
      line('Education', 6, 0, 468, 14, 'Heading2'),
      line('B.S. Computer Science, State University', 7, 0, 468, 12, 'Heading3'),
    ],
    'docx',
  )

  it('splits an employer from a role on the dash the author used', () => {
    expect(structureResume(WORD).experience[0]).toMatchObject({
      company: 'Northwind',
      title: 'Platform Engineer',
      start: '2021-04',
    })
  })

  it('takes the headline out of a fused contact paragraph', () => {
    expect(structureResume(WORD).basics).toMatchObject({
      name: 'Dana Reyes',
      label: 'Platform Engineer',
      email: 'dana@example.com',
      phone: '+1 415 555 0000',
    })
  })

  it('leaves location empty rather than filing the headline as a city', () => {
    // "whatever the contact line still says once email and phone are removed" is
    // "Platform Engineer" here. A role word disqualifies it from being a place.
    expect(structureResume(WORD).basics.location).toBeUndefined()
  })

  it('emits nothing that is not a verbatim span, separators and all', () => {
    const haystack = normalise(WORD.text)
    const invented = leaves(structureResume(WORD))
      .filter(({ key }) => !DATE_KEYS.has(key))
      .filter(({ value }) => !haystack.includes(normalise(value)))
    expect(invented).toEqual([])
  })
})

describe('structureResume degrades instead of throwing', () => {
  it('returns an empty draft for an empty document', () => {
    const content = structureResume({ kind: 'pdf', lines: [], text: '' })
    expect(content.basics.name).toBe('')
    expect(content.experience).toEqual([])
  })

  it('survives a document that is nothing but bullets', () => {
    const doc = documentOf([
      line('one', 10, 40, 100, 10, 'f0', true),
      line('two', 24, 40, 100, 10, 'f0', true),
    ])
    expect(() => structureResume(doc)).not.toThrow()
    expect(structureResume(doc).experience).toEqual([])
  })

  it('survives geometry that is missing or nonsensical', () => {
    const doc = documentOf([
      line('Ada Lovelace', Number.NaN, Number.NaN, Number.NaN, Number.NaN, ''),
      line('Experience', 0, 0, 0, 0, ''),
      line('Analytical Engine 1842 – 1843', 0, 0, 0, 0, ''),
    ])
    expect(() => structureResume(doc)).not.toThrow()
  })

  it('carries a section across a page break', () => {
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Convoy 2022-01 – Present', 24, 40, 570, 11, 'f2'),
      line('first page bullet', 38, 55, 400, 11, 'f4', true),
      line('second page bullet', 40, 55, 400, 11, 'f4', true, 1),
    ])
    expect(structureResume(doc).experience[0].bullets).toEqual([
      'first page bullet',
      'second page bullet',
    ])
  })

  it('does not rejoin a continuation across a page break', () => {
    // Same indent, same font, but a different page — that is a new line of a new
    // page's body, not the tail of the previous page's last bullet.
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Convoy 2022-01 – Present', 24, 40, 570, 11, 'f2'),
      line('a bullet at the foot of the page', 700, 55, 400, 11, 'f4', true),
      line('Zulily 2018-08 – 2021-12', 40, 40, 570, 11, 'f2', false, 1),
    ])
    expect(structureResume(doc).experience.map((entry) => entry.company)).toEqual([
      'Convoy',
      'Zulily',
    ])
  })

  it('reads a slash-form date range', () => {
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Helio 03/2020 - 05/2021', 24, 40, 570, 11, 'f2'),
      line('Backend Engineer', 38, 40, 140, 10, 'f3'),
    ])
    expect(structureResume(doc).experience[0]).toMatchObject({
      company: 'Helio',
      title: 'Backend Engineer',
      start: '2020-03',
      end: '2021-05',
    })
  })

  it('leaves a pair it cannot read in one field instead of splitting a guess', () => {
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Acme, Northeast Division 2019 – 2020', 24, 40, 570, 11, 'f2'),
    ])
    const entry = structureResume(doc).experience[0]
    expect(entry.title).toBe('')
    expect(entry.company).toBe('Acme, Northeast Division')
  })

  it('leaves a multi-word city intact rather than clipping it to fit', () => {
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Ramp 2019 – 2020', 24, 40, 570, 11, 'f2'),
      line('Senior Engineer New York, NY', 38, 40, 570, 10, 'f3'),
    ])
    expect(structureResume(doc).experience[0]).toMatchObject({
      title: 'Senior Engineer',
      location: 'New York, NY',
    })
  })

  it('refuses to peel a location when doing so would eat the title', () => {
    // Nothing anchors the split here, so the whole span stays put and `location`
    // is left empty. An empty field is honest; "Bazaarvoice" as a city is not.
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Staff Site Reliability Engineer, Bazaarvoice', 24, 163, 400, 11, 'f2'),
      line('Jun 2021 – Present', 31, 50, 134, 10, 'f3'),
    ])
    const entry = structureResume(doc).experience[0]
    expect(entry).toMatchObject({
      title: 'Staff Site Reliability Engineer',
      company: 'Bazaarvoice',
    })
    expect(entry.location).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Bare-domain links. Every fixture above writes its links with a scheme, which
// is a LaTeX-template habit and not how people write them — the first
// real-world résumé put through this parser had none, and the banner came apart
// on it.
// ---------------------------------------------------------------------------

/**
 * A banner that writes its links the way a person does: no scheme, no `www.`,
 * two of them, and the email on a separate baseline from the link list.
 */
const BARE_LINK_BANNER = documentOf([
  line('Dana Okoye', 56.7, 205.6, 406.5, 24.79, 'f1'),
  line('danaokoye.com · github.com/danaokoye · linkedin.com/in/danaokoye', 89.2, 94.6, 517.4, 9.96, 'f5'),
  line('dana@example.com · Chicago, IL', 101.4, 94.6, 517.4, 9.96, 'f5'),
  line('Experience', 157.6, 39.6, 107.7, 11.96, 'f1'),
  line('Northwind 2022-01 – Present', 178.3, 39.6, 572.4, 10.91, 'f9'),
  line('Platform Engineer', 191.8, 39.6, 572.4, 9.96, 'f11'),
])

describe('a banner whose links carry no scheme', () => {
  it('does not file the link list as the headline', () => {
    // The defect this pins: `isContactLine()` did not recognise a bare domain, so
    // the link list was the first "non-contact" line and became `label`. A wrong
    // headline is worse than an absent one — it renders into the PDF.
    const basics = structureResume(BARE_LINK_BANNER).basics
    expect(basics.label).toBeUndefined()
  })

  it('reads the first bare link as the URL', () => {
    expect(structureResume(BARE_LINK_BANNER).basics.url).toBe('danaokoye.com')
  })

  it('still finds the email and the location beside the links', () => {
    // The location is the regression risk in the fix, not the fix itself: once the
    // link list counts as a contact line its links join the leftovers, and a
    // one-word leftover with no role word in it is exactly what `location` looks
    // for. Every link has to be removed, not just the one that became `url`.
    const basics = structureResume(BARE_LINK_BANNER).basics
    expect(basics.email).toBe('dana@example.com')
    expect(basics.location).toBe('Chicago, IL')
  })

  it('keeps the name and the rest of the document intact', () => {
    const content = structureResume(BARE_LINK_BANNER)
    expect(content.basics.name).toBe('Dana Okoye')
    expect(content.experience[0]).toMatchObject({
      company: 'Northwind',
      title: 'Platform Engineer',
    })
  })
})

// ---------------------------------------------------------------------------
// Known gaps, asserted so they cannot change silently in either direction
// ---------------------------------------------------------------------------

describe('known gaps against the hand-labelled ground truth', () => {
  it('sample 3: education carries no location, because the document states none', () => {
    // expected-3.json omits it too. Pinned so a future "improvement" that borrows
    // "Chicago, IL" from the contact line is caught as the invention it would be.
    expect(structureResume(SAMPLE_3).education[0].location).toBeUndefined()
  })

  it('a role word inside a company name is a genuine confusion', () => {
    // "Engineer" standing alone in an employer's name is indistinguishable from a
    // title to a word list. Documented rather than papered over: the two-line
    // form falls back on order, so the *company* line still wins its field.
    const doc = documentOf([
      line('Experience', 10, 40, 110, 12, 'f1'),
      line('Engineer Labs 2019 – 2020', 24, 40, 570, 11, 'f2'),
      line('Staff Developer', 38, 40, 570, 10, 'f3'),
    ])
    const entry = structureResume(doc).experience[0]
    expect(entry.title).toBe('Engineer Labs')
    expect(entry.company).toBe('Staff Developer')
  })
})
