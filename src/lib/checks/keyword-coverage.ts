import type { ResumeContent } from '@/lib/resume/schema'

import { extractJdTerms, stem, termKey, tokenize } from './jd-terms'
import type { CheckOutcome, CheckRunInput, CoverageResult, KeywordCoverageDetail } from './types'

/**
 * keyword_coverage — which of the posting's words are literally on the page.
 *
 * Deterministic, no model. The matching rule is fixed by the hand-labeled
 * fixtures in `gates/fixtures/checks/keyword-coverage-{1,2,3}.json`, which were
 * written by reading the résumé, before this file existed: case-insensitive,
 * word-boundary (never substring — `AI` is not inside `Plaid`), hyphens and
 * spaces are the same separator, singular and plural are the same word, and a
 * multi-word term matches as a contiguous phrase inside one field, never
 * word-by-word.
 *
 * And that is all it does. `latency` stays missing when the résumé says `p99`;
 * `monitoring` stays missing when it says `Observability`; `PostgreSQL` stays
 * missing when it says `Postgres`. **The refusal to infer is the measurement.**
 * A term reported missing is not a verdict on the candidate — it is the honest
 * statement that the word the JD chose is not on the page, which is the only
 * thing a keyword check can truthfully say. Widening the rule to synonyms or
 * stems would make it claim something it cannot know, and the fixtures fail the
 * build when it tries.
 */

/** Matched and missing terms, echoed back in the casing they arrived in. */
export function scoreCoverage(terms: readonly string[], content: ResumeContent): CoverageResult {
  const segments = flattenSegments(content).map((segment) => tokenize(segment).map(stem))

  const matched: string[] = []
  const missing: string[] = []

  for (const term of terms) {
    const needle = termKey(term).split(' ').filter(Boolean)
    const hit = needle.length > 0 && segments.some((segment) => containsPhrase(segment, needle))
    ;(hit ? matched : missing).push(term)
  }

  return { matched, missing }
}

/**
 * Runner slot: reports `8 / 12 JD terms`.
 *
 * The denominator is the terms actually extracted from this posting, never a
 * percentage of some imagined ideal — no such total exists, and inventing one
 * would be the ATS score under another name.
 */
export async function runKeywordCoverage(input: CheckRunInput): Promise<CheckOutcome> {
  const jdText = input.job?.jdText?.trim()

  if (!jdText) {
    return notMeasured('No job description attached, so there are no terms to cover.')
  }

  const terms = extractJdTerms(jdText)
  if (terms.length === 0) {
    return notMeasured('No terms could be read out of this job description.')
  }

  const { matched, missing } = scoreCoverage(terms, input.version.content)
  const details: KeywordCoverageDetail = { terms, matched, missing }

  return {
    kind: 'keyword_coverage',
    verdict: missing.length === 0 ? 'pass' : 'warn',
    summary: `${matched.length} / ${terms.length} JD terms`,
    details,
  }
}

function notMeasured(error: string): CheckOutcome {
  const details: KeywordCoverageDetail = { terms: [], matched: [], missing: [] }
  return { kind: 'keyword_coverage', verdict: 'warn', summary: 'Not measured', details, error }
}

/**
 * The résumé as a list of independently searchable fields.
 *
 * Fields are separate segments so a phrase can never be assembled across a
 * boundary — `Kubernetes` in one skills item and `Terraform` in the next are
 * not the phrase "Kubernetes Terraform", and saying they were is a shade of the
 * same word-by-word OR the fixtures rule out.
 */
function flattenSegments(content: ResumeContent): string[] {
  const segments: string[] = []
  const push = (value?: string | null): void => {
    if (value) segments.push(value)
  }

  const { basics } = content
  push(basics.name)
  push(basics.label)
  push(basics.email)
  push(basics.url)
  push(basics.location)
  push(basics.summary)

  for (const role of content.experience) {
    push(role.company)
    push(role.title)
    push(role.location)
    for (const bullet of role.bullets) push(bullet)
  }

  for (const school of content.education) {
    push(school.institution)
    push(school.degree)
    push(school.location)
    for (const bullet of school.bullets) push(bullet)
  }

  for (const group of content.skills) {
    push(group.category)
    for (const item of group.items) push(item)
  }

  for (const project of content.projects) {
    push(project.name)
    push(project.description)
    for (const bullet of project.bullets) push(bullet)
  }

  for (const section of content.custom) {
    push(section.title)
    for (const bullet of section.bullets) push(bullet)
  }

  return segments
}

/** Contiguous-subsequence search — the phrase rule, and the word boundary with it. */
function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length > haystack.length) return false

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let ok = true
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }

  return false
}
