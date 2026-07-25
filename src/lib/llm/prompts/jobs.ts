import type { LlmSystemBlock } from '../types'

/**
 * `kind:extract` — job posting markdown → the four fields the pipeline needs
 * (Phase 2 ingest).
 *
 * Job pages are chrome-heavy and inconsistent, so the extraction is narrow on
 * purpose: title, company, location, and one sentence about the company. The
 * full description is stored verbatim from the scrape and never paraphrased —
 * the JD is evidence for tailoring later, so a summary would destroy the thing
 * we came for.
 */

export const EXTRACT_JOB_SYSTEM = `You read the markdown of a job posting and return its identity as JSON.

Return ONLY a JSON object, no prose and no code fences:
{ "title": string, "company": string, "location": string | null, "companyBlurb": string | null }

Rules:
- "title" is the role, without the team, seniority banner, or requisition id.
- "company" is the hiring company, not the job board the posting was found on.
- "location" is as written in the posting ("San Francisco, CA", "Remote (US)").
  Use null when the posting does not say.
- "companyBlurb" is one sentence about the company, copied from the posting.
  Use null when the posting does not describe the company.
- Never invent a value. Null is a correct answer.`

export function extractJobSystem(): LlmSystemBlock[] {
  return [{ text: EXTRACT_JOB_SYSTEM, cache: true }]
}

export function extractJobMessage(markdown: string, url: string): string {
  return `Job posting fetched from ${url}:\n\n---\n${markdown}\n---\n\nReturn the JSON object.`
}
