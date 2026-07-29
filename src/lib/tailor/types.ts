import type { FitJob } from '@/lib/llm/prompts/fit'
import type { ResumeChangeKind } from '@/lib/resume/diff'

/**
 * The tailoring vocabulary — one definition of what a proposed change is, for
 * the engine that produces them, the validator that judges them, the applier
 * that writes the accepted ones into a child version, and the review UI that
 * renders them (`TAILORING-DIFF.md` is the interaction spec).
 *
 * Three rules are baked into these types and enforced by the validator. They
 * are the product's honesty invariant, not implementation detail:
 *
 *  1. **`validateChanges` never drops an entry.** Refusal is a *status*, not a
 *     deletion. The user sees what the model attempted — including the claims
 *     hunt refused to author — because a silently shortened list is a lie about
 *     what happened. That is why `status` lives on the change itself rather
 *     than the validator returning two arrays.
 *  2. **Refusal never blocks anything.** A refused change is unapplied and
 *     unrendered, and the user can still save, still hand-edit the field, still
 *     add the claim themselves (TAILORING-DIFF §5). The validator is a
 *     provenance instrument, not a morality gate, and nothing here lectures.
 *  3. **There is no aggregate.** No score, no confidence, no "tailoring
 *     strength" — not on a change, not on a run. A count of changes is a fact;
 *     a number scoring the résumé would be invented. There is nowhere in these
 *     types to put one, which is the point.
 */

/**
 * Same four kinds the semantic diff speaks (`src/lib/resume/diff.ts`) — a
 * tailored change and a version-to-version change render through the same
 * DiffRow, so they must not drift into two vocabularies.
 */
export type TailorChangeKind = ResumeChangeKind

/**
 * `proposed` — cited, applicable, waiting on the user's accept/reject.
 * `refused` — hunt will not author it; shown struck through as a
 * FabricationFlag, never applied, never rendered into the PDF.
 */
export type ChangeStatus = 'proposed' | 'refused'

/** Provenance for one claim: where in the source résumé it comes from. */
export interface Citation {
  /** A path into the *source* content — `experience[0].bullets[3]`. */
  path: string
  /** The exact text at that path the change rests on. Must really appear there. */
  snippet: string
}

export interface TailorChange {
  /** Stable within a run; the DiffRow pin number and keyboard focus key off it. */
  id: string
  kind: TailorChangeKind
  /** Where the change lands in the résumé — an existing path, or the array for an `add`. */
  path: string
  /** The text being replaced. Absent for `add`. */
  was?: string | null
  /** The proposed text. */
  now: string
  /** Rationale in plain language, tied to the posting. Rendered under `WHY`. */
  why: string
  /** Null when the model cited nothing at all — an automatic refusal. */
  citation: Citation | null
  status: ChangeStatus
  /** Present on refusals; the sentence the FabricationFlag shows. */
  refusedReason?: string
}

export interface TailorRun {
  /** Every proposal the model made, in the order it made them — refusals included. */
  changes: TailorChange[]
  /** The version the changes are diffed against; the saved child's parent. */
  baseVersionId?: string
  /** The posting the run was tailored to. */
  job: FitJob
}

export type { FitJob }
