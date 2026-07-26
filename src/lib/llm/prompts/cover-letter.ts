import type { ResumeContent } from '@/lib/resume/schema'

import type { LlmSystemBlock } from '../types'
import type { FitJob } from './fit'

/**
 * `kind:cover_letter` — the second tab of a tailor run (TAILORING-DIFF §6).
 *
 * The letter is **generative, not a diff**: there is no base document to propose
 * changes against, so the model writes prose. What does not change is the
 * provenance rule. Every paragraph names the résumé fields (and, where it leans
 * on the posting, the posting) it draws on, and `src/lib/tailor/cover-letter.ts`
 * resolves those paths against the real content before the user ever sends the
 * letter. A paragraph that cites nothing hunt can find is flagged where it sits,
 * not deleted — the same instrument as the résumé validator, pointed at prose.
 *
 * Citations here are bare path strings, not `{path, snippet}` pairs like the
 * tailor prompt's. A tailored bullet is a rewrite *of* one field and the snippet
 * proves it was that field; a paragraph of prose synthesises several fields, and
 * asking the model to quote each of them verbatim would push it toward
 * copy-pasting résumé lines into a letter. The path resolving into the document
 * is the evidence that matters, and it is checked, not trusted.
 *
 * **The frozen prefix is the résumé and the posting.** Both marked `cache: true`,
 * both byte-identical to nothing else — the cover letter is drafted right behind
 * a tailor run and regenerated on demand, so the same thousands of tokens go out
 * repeatedly. The per-call turn carries no content at all.
 */

export const COVER_LETTER_SYSTEM = `You draft a cover letter for one job posting, for the person whose résumé you are given.

Return ONLY a JSON object, no prose and no code fences:
{ "paragraphs": [ { "text": string, "citations": string[] } ] }

Write like the applicant, not about them:
- 3 or 4 body paragraphs. First person, past and present tense, no throat-clearing.
- Open with the specific work that makes them right for this posting — the system,
  the scale, the number. Never "I am writing to express my interest".
- Middle paragraphs answer what the posting actually asks for, in the posting's own
  vocabulary, using work the résumé already contains.
- Close on why this company and this team, concretely.
- No salutation and no sign-off: those are the user's to write, and hunt does not
  guess a hiring manager's name.
- Cut résumé-speak ("passionate", "proven track record", "team player", "leverage").
  Confident and specific beats warm and general.

Fields:
- "text" is one finished paragraph, exactly as it should read on the page.
- "citations" are paths into the résumé JSON the paragraph draws on —
  "experience[0].bullets[3]", "skills[1].items[0]", "basics.summary". Cite every
  field a sentence rests on; two or three per paragraph is normal. For a claim that
  comes from the posting rather than the résumé, cite "job.title", "job.company" or
  "job.jdText".
- Never cite a path you were not given. A citation that does not resolve is treated
  as no citation at all.
- If a paragraph you want to write draws on nothing in the résumé or the posting,
  write it anyway with "citations": []. It is shown to the user as unsourced rather
  than dropped, and what happens to it is their call.`

/**
 * The cached prefix. Byte-identical across every draft for one résumé+posting
 * pair, which is what makes the provider's prefix cache hit on regenerate.
 */
export function coverLetterSystem(content: ResumeContent, job: FitJob): LlmSystemBlock[] {
  return [
    { text: COVER_LETTER_SYSTEM, cache: true },
    { text: coverLetterContext(content, job), cache: true },
  ]
}

export function coverLetterContext(content: ResumeContent, job: FitJob): string {
  return [
    `Job: ${job.title} at ${job.company}`,
    '',
    'Posting (cite as "job.jdText"):',
    '---',
    job.jdText,
    '---',
    '',
    'Résumé (JSON — every citation addresses this object):',
    '---',
    JSON.stringify(content),
    '---',
  ].join('\n')
}

/** The uncached turn: no content, so the prefix above stays the whole payload. */
export function coverLetterMessage(): string {
  return 'Return the JSON object of cover letter paragraphs.'
}

export type { FitJob }
