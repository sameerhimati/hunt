import type { ResumeContent } from '@/lib/resume/schema'

import type { LlmSystemBlock } from '../types'

/**
 * `kind:rate` — the fit rating prompt. One definition of Strong / Possible /
 * Reach for the whole product: the application page's match rating (Phase 3)
 * and the sourcing board's batch rating (Phase 5) both come through here, so a
 * job can't read "Strong" on one screen and "Possible" on the other.
 *
 * The model returns a tier and reasons. It never returns a number, and the
 * schema on the other side has nowhere to put one — that is the honest-AI
 * invariant expressed structurally rather than as a plea in the prompt. "78%
 * match" would be a fabricated measurement of an unmeasurable thing; "Strong,
 * because you own a payments ledger and they're hiring for the charge path" is
 * something the user can check.
 *
 * Reasons cite résumé paths for the same reason tailoring does: a claim about
 * the user's experience that can't be traced back to their own document is the
 * model's imagination. Gaps are the exception — a gap cites nothing, because
 * the evidence for it is an absence.
 */

export const TIER_DEFINITIONS = `- "strong": the résumé shows direct experience with the role's core work. The
  hiring manager would read it and see someone who has already done this job.
- "possible": real adjacent experience, with a gap or two the user can argue
  around. Worth applying to; not a formality.
- "reach": the core requirements are mostly unevidenced in this résumé. Still a
  legitimate application — say plainly what is missing.`

export const RATE_FIT_SYSTEM = `You judge how one résumé fits one job posting, for the person who wrote the résumé.

Return ONLY a JSON object, no prose and no code fences:
{ "tier": "strong" | "possible" | "reach",
  "reasons": [ { "text": string, "citations": string[], "gap": boolean } ] }

Tiers:
${TIER_DEFINITIONS}

Rules:
- Never output a number, percentage, score or grade — not in "tier", not inside a
  reason. There is no such measurement; a qualitative tier with reasons is the
  honest answer.
- 2 to 4 reasons. Each one names something concrete in the posting and what in
  the résumé does or does not answer it.
- "citations" are paths into the résumé JSON — "experience[0].bullets[3]",
  "skills[1].items[0]", "basics.summary". Cite the fields your reason rests on.
  Never cite a path you were not given.
- A reason about something the résumé lacks sets "gap": true and cites nothing.
- Write to the user about their own search, in plain sentences. Do not flatter,
  do not hedge, and do not advise them whether to apply — that is their call.`

/** The frozen prefix: identical for every rating, so it caches. */
export function rateFitSystem(): LlmSystemBlock[] {
  return [{ text: RATE_FIT_SYSTEM, cache: true }]
}

export interface FitJob {
  title: string
  company: string
  jdText: string
}

export function rateFitMessage(content: ResumeContent, job: FitJob): string {
  return [
    `Job: ${job.title} at ${job.company}`,
    '',
    'Posting:',
    '---',
    job.jdText,
    '---',
    '',
    'Résumé (JSON — citation paths are paths into this object):',
    '---',
    JSON.stringify(content),
    '---',
    '',
    'Return the JSON object.',
  ].join('\n')
}
