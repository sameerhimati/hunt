import type { ResumeContent } from '@/lib/resume/schema'

import type { LlmSystemBlock } from '../types'
import type { FitJob } from './fit'

/**
 * `kind:tailor` — the prompt behind the hero screen (TAILORING-DIFF.md).
 *
 * Two things about it are deliberate.
 *
 * **It asks for provenance, not for timidity.** The model is told to reframe
 * hard: the posting's vocabulary, the result first, strong verbs, the same true
 * work described *for this job* instead of in general. That is the product.
 * What it is also told is to say where each change came from — a path into the
 * résumé and the exact text it drew on. The citation is an instrument, not a
 * leash: `src/lib/tailor/validator.ts` decides what is sourced, and it decides
 * it by resolving paths, not by trusting adjectives. A prompt that begged the
 * model to be honest would be enforcing nothing while sounding like it did.
 * An uncitable proposal is still welcome — it comes back with `citation: null`,
 * gets refused, and is shown to the user, who can add it themselves if it's
 * true (TAILORING-DIFF §5).
 *
 * **The frozen prefix is everything the model reads.** System instructions,
 * then the résumé JSON and the posting, both marked `cache: true`. A tailor run
 * is re-run — regenerate, re-tailor after an edit, the cover letter draft right
 * behind it — and the résumé plus the JD are by far the largest tokens in the
 * request. Caching them is the single biggest cost lever in the app, so the
 * per-call turn below carries no content at all.
 */

export const TAILOR_SYSTEM = `You tailor one résumé against one job posting, for the person who wrote the résumé.

Return ONLY a JSON object, no prose and no code fences:
{ "changes": [ { "kind": "edit" | "add" | "remove" | "reorder",
                 "path": string,
                 "now": string,
                 "why": string,
                 "citation": { "path": string, "snippet": string } | null } ] }

Write like a sharp editor:
- Lead with the result and the posting's own vocabulary. Numbers, systems, scale.
- Strong verbs. Cut hedging, filler and résumé-speak ("responsible for", "helped
  with", "worked on").
- Reframe hard. Emphasis, ordering, framing and word choice are yours to change —
  taking work that is already there and making it read for this posting instead of
  for no posting in particular is the whole job.
- Propose the changes worth reviewing, usually 3 to 8. One change per entry: a whole
  bullet or a whole field, never half a sentence.

Fields:
- "path" addresses the résumé JSON: "experience[0].bullets[3]", "basics.summary",
  "skills[1].items[0]". For "add", give the list to append to
  ("experience[0].bullets"). For "reorder", give the list and put the full new order
  in "now", joined by " · ".
- "now" is the finished text, exactly as it should read on the page.
- "why" is one or two sentences tied to the posting, written to the user about their
  own résumé.
- "citation" is where in the résumé this change draws from: "path" is the field you
  took it from, "snippet" is that field's text copied verbatim. A phrase is enough,
  but it is matched against the source, so copy it rather than paraphrasing it.
- If something you want to propose draws on nothing in the résumé, propose it anyway
  with "citation": null. It is shown to the user as unsourced instead of being
  dropped, and what happens to it is their call.`

/**
 * The cached prefix. Byte-identical across every call for one résumé+posting
 * pair, which is what makes the provider's prefix cache hit.
 */
export function tailorSystem(content: ResumeContent, job: FitJob): LlmSystemBlock[] {
  return [
    { text: TAILOR_SYSTEM, cache: true },
    { text: tailorContext(content, job), cache: true },
  ]
}

export function tailorContext(content: ResumeContent, job: FitJob): string {
  return [
    `Job: ${job.title} at ${job.company}`,
    '',
    'Posting:',
    '---',
    job.jdText,
    '---',
    '',
    'Résumé (JSON — every "path" and every citation addresses this object):',
    '---',
    JSON.stringify(content),
    '---',
  ].join('\n')
}

/** The uncached turn: no content, so the prefix above stays the whole payload. */
export function tailorMessage(): string {
  return 'Return the JSON object of proposed changes.'
}

export type { FitJob }
