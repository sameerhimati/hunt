import type { JobListing } from '@/lib/adapters/jobs/types'
import type { ResumeContent } from '@/lib/resume/schema'

import type { LlmSystemBlock } from '../types'

import { TIER_DEFINITIONS } from './fit'

/**
 * `kind:rate`, batch call site — a page of sourcing results rated in one call.
 *
 * Same prompt kind as `./fit.ts` on purpose: one kind means one definition of
 * Strong / Possible / Reach, and the batch response is the single-job shape
 * repeated under an `externalId`. The tiers come from `TIER_DEFINITIONS` rather
 * than being restated here — two prose descriptions of "possible" are two
 * different products.
 *
 * Two constraints this file exists to honour:
 *
 * 1. **The system blocks are the cached prefix.** The rules and the résumé are
 *    byte-identical across every chunk of a page and across every later search,
 *    so both carry `cache: true`; only the listings vary, and they ride in the
 *    message. A fifty-result page is several calls sharing one prefix — without
 *    the breakpoint we would pay full freight for the same résumé each time.
 *
 * 2. **The prompt contains the literal string `Rate each listing`.** That is the
 *    `match` discriminator in `gates/fixtures/llm/rate-batch.json` — it is how
 *    the scripted fake tells this call site apart from Phase 3's single-job
 *    `rate` fixture (see `pickScript` in `src/lib/testmode/llm.ts`). Drop the
 *    phrase and every gate that rates a board fails with the other phase's
 *    fixture. It appears in the frozen system block and in the message, so
 *    neither half of the request can lose it silently.
 *
 * The response shape the parser expects:
 *   `{ "ratings": [ { "externalId", "tier", "reasons": [{text, citations, gap}] } ] }`
 * No numbers, ever — not a score, not a confidence, not a rank.
 */

export const RATE_BATCH_SYSTEM = `Rate each listing on a page of job-search results against one résumé, for the person who wrote the résumé.

Return ONLY a JSON object, no prose and no code fences:
{ "ratings": [ { "externalId": string,
                 "tier": "strong" | "possible" | "reach",
                 "reasons": [ { "text": string, "citations": string[], "gap": boolean } ] } ] }

Tiers:
${TIER_DEFINITIONS}

Rules:
- One entry per listing you can judge, carrying that listing's "externalId" back
  exactly as it was given. Never invent an id, never merge two listings.
- If a posting says too little to judge, leave it out of "ratings" entirely. An
  unrated card is honest; a guessed tier is not.
- Never output a number, percentage, score, rank or grade — not in "tier", not
  inside a reason. There is no such measurement; a qualitative tier with reasons
  is the honest answer.
- 1 to 3 reasons per listing. Each one names something concrete in that posting
  and what in the résumé does or does not answer it. These are scan-length
  sentences on a results card, not a report.
- "citations" are paths into the résumé JSON — "experience[0].bullets[3]",
  "skills[1].items[0]", "basics.summary". Cite the fields your reason rests on.
  Never cite a path you were not given.
- A reason about something the résumé lacks sets "gap": true and cites nothing.
- Write to the user about their own search, in plain sentences. Do not flatter,
  do not hedge, and do not advise them whether to apply — that is their call.`

/**
 * The frozen prefix: the rules, then the résumé. Identical for every chunk of
 * every page, so it caches.
 */
export function rateBatchSystem(content: ResumeContent): LlmSystemBlock[] {
  return [
    { text: RATE_BATCH_SYSTEM, cache: true },
    {
      text: [
        'Résumé (JSON — citation paths are paths into this object):',
        '---',
        JSON.stringify(content),
        '---',
      ].join('\n'),
      cache: true,
    },
  ]
}

/** The only part that varies per call: the listings, keyed by `externalId`. */
export function rateBatchMessage(listings: JobListing[]): string {
  const blocks = listings.map((listing) =>
    [
      `externalId: ${listing.externalId}`,
      `Job: ${listing.title} at ${listing.company}`,
      listing.location ? `Location: ${listing.location}` : null,
      'Posting:',
      listing.description?.trim() ||
        '(no description supplied — judge from the title, or leave this one out)',
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  )

  return [
    'Rate each listing below against the résumé.',
    '',
    blocks.join('\n\n---\n\n'),
    '',
    'Return the JSON object.',
  ].join('\n')
}
