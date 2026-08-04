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
 * **The length and tone rules are the reader's, not ours.** They are written from
 * what companies hiring at this size actually ask for — five to ten sentences,
 * obviously specific to the posting, matched to the company's own register, and
 * not a reworded résumé, because the reader has the résumé open beside the letter.
 * They are constraints on the artifact, so they live in the prompt rather than in
 * a style note somewhere: a letter that is twice the length the reader wants is
 * not a letter that needs editing, it is the wrong output.
 *
 * **Sentences alone were the wrong unit, and the model found the gap.** Capping
 * sentence *count* is satisfied by writing longer sentences, which is exactly what
 * happened: one draft came back inside ten sentences at 255 words while a simpler
 * posting got 152. So `MAX_LETTER_WORDS` binds too, and the instruction says both
 * limits bind — a rule the model can satisfy while defeating its purpose is not a
 * rule. The count is also shown to the user beside the draft, because a ceiling
 * enforced only inside a prompt is a hope, and hunt does not ship those.
 *
 * That is a floor, not a fix. The deeper cause is that the model is asked to answer
 * "why this company" and "what would you bring" from a résumé, which contains
 * neither, so it pads with the material it does have. The notebook of facts (see
 * `docs/roadmap.md`) is what actually addresses it; a word cap only bounds the
 * damage in the meantime.
 *
 * That last rule pulls against the guard, and the prompt reconciles it rather than
 * letting the model discover the tension. `draws()` in
 * `src/lib/tailor/cover-letter.ts` requires a paragraph to share distinctive terms
 * with the field it cites, which quietly rewards prose that restates a bullet —
 * the exact thing the reader skims. The resolution is that *naming* the work earns
 * the citation and the padding around it earns nothing, so the instruction is to
 * name it once and stop. A shorter letter is not a less citable one.
 *
 * **The frozen prefix is the résumé and the posting.** Both marked `cache: true`,
 * both byte-identical to nothing else — the cover letter is drafted right behind
 * a tailor run and regenerated on demand, so the same thousands of tokens go out
 * repeatedly. The per-call turn carries no content at all.
 */

/**
 * The word ceiling, enforced in two places that must agree: the instruction below,
 * and the live count in `src/components/tailor/cover-letter-tab.tsx`. Ten sentences
 * of twenty words is the longest letter the sentence rule was ever meant to permit,
 * so that product is the ceiling — a letter past it is dense, not thorough.
 */
export const MAX_LETTER_WORDS = 200

export const COVER_LETTER_SYSTEM = `You draft a cover letter for one job posting, for the person whose résumé you are given.

Return ONLY a JSON object, no prose and no code fences:
{ "paragraphs": [ { "text": string, "citations": string[] } ] }

Short and obviously specific to this posting. The reader has the résumé open beside
the letter and will skim anything that repeats it.
- 2 or 3 paragraphs, 5 to 10 sentences in total, and never more than
  ${MAX_LETTER_WORDS} words. Both limits bind: ten long sentences is not a short
  letter, and a sentence you had to pack to stay under the count is the one the
  reader gives up on.
- First person, past and present tense, no throat-clearing. Never "I am writing to
  express my interest", and never "I'm X" — they know who they are reading.
- Open on the one piece of work that makes them right for this posting: the system,
  the scale, the number. Name it once, in a sentence. Do not then explain it.
- Say how they would help with what this company is actually trying to do — what
  the posting says the team owns, ships or is stuck on. This is the paragraph that
  could not be pasted into a letter for another company; if it could, rewrite it.
- Match the posting's register. A posting that says "we're a small team that ships
  daily" gets answered in that voice, not in corporate. Formal only if it is.
- No salutation and no sign-off: those are the user's to write, and hunt does not
  guess a hiring manager's name.

Do not restate the résumé. A paragraph that is a bullet in longer words is worse
than no paragraph — it costs the reader time and tells them nothing. Naming the
specific work is what makes a citation resolve; the sentences of padding around it
are what get skimmed. Cut them.

The letter must not read as machine-written. That means no "I'm excited to", no
"As a [role] with N years of experience", no "passionate", "proven track record",
"team player", "leverage", "deeply", "resonates", "at the intersection of"; no
three-item lists used for rhythm, no "not only … but also", no sentence that
restates the previous one with different words. Plain declaratives, one idea each,
and specifics where a general claim would be easier.

Formatting survives as line breaks and nothing else — an ATS eats the rest. No
bullets, no headers, no bold, no markdown.

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
