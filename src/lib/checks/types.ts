import type { CheckKind, CheckVerdict, FitTier } from '@/lib/db/enums'
import type { FitReason } from '@/lib/fit/rate'
import type { LlmLike } from '@/lib/llm'
import type { FitJob } from '@/lib/llm/prompts/fit'
import type { ResumeContent } from '@/lib/resume/schema'
import type { TexInput } from '@/lib/resume/tex'

/**
 * The checks vocabulary.
 *
 * Five instruments, each named for the one thing it measures, each reporting a
 * concrete count the user can verify against their own document — `2 of 14
 * fields dropped`, `18 / 22 JD terms`. **There is no aggregate.** No total, no
 * score, no percentage, no grade: a `CheckOutcome` has nowhere to put one and
 * `runAllChecks` returns a list, not a rollup. That is the honest-AI invariant
 * expressed as a type rather than a promise in a doc — an ATS score would be a
 * fabricated measurement of something nobody outside the ATS can measure, and
 * the gate greps this payload to keep it that way (SCREENS §7, DESIGN §7).
 *
 * Unflattering readings are normal output, not failure states. The copy each
 * check writes into `summary` states what it found and stops; the panel offers
 * the fix. Nothing here scolds.
 */

export type { CheckKind, CheckVerdict } from '@/lib/db/enums'

/**
 * The résumé version under test — exactly what the renderer needs, plus the id
 * so a persisted `CheckResult` can point back at it. Callers holding a DB row
 * pass `{ id, content: versionContent(row), templateId, rawLatexOverride }`.
 */
export interface CheckVersion extends TexInput {
  id?: string
}

/** The posting a JD-relative check reads. `id` is carried for persistence only. */
export interface CheckJob extends FitJob {
  id?: string
}

/**
 * A résumé as an ATS parser handed it back: the same shape with the fields it
 * lost missing or nulled. Loose on purpose — the dropped fields *are* the
 * measurement, so the type must be able to express a document with holes in it.
 */
export type ParsedResume = Loose<ResumeContent>

type Loose<T> = T extends (infer U)[]
  ? Loose<U>[]
  : T extends object
    ? { [K in keyof T]?: Loose<T[K]> | null }
    : T

/**
 * The open-source ATS parser behind `parse-fidelity`, wrapped so the check can
 * run against a `Fake*` twin in tests and gates (the real one is picked and
 * adapted in `parser-adapter.ts`).
 */
export interface ResumeParser {
  id: string
  parse(pdf: Buffer): Promise<ParsedResume>
}

/** What every check runner receives. Checks take what they need and ignore the rest. */
export interface CheckRunInput {
  version: CheckVersion
  /** Absent for a résumé opened outside an application — JD-relative checks report that. */
  job?: CheckJob | null
  /** Injected by tests and gates; production resolves the configured model. */
  llm?: LlmLike | null
  /** parse_fidelity only; defaults to the configured parser adapter. */
  parser?: ResumeParser | null
}

/** One issue from `lintFormat`. Codes the gate requires: `bullet-too-long`, `date-format-mixed`, `first-person`. */
export interface FormatIssue {
  /** Kebab-case, stable — the UI keys its copy off it. */
  code: string
  /** Where it is, so the fix can deep-link: `experience[0].bullets[4]`. */
  path: string
  /** What was found, in the user's terms. */
  detail: string
}

/** One phrase that reads machine-written, with a human rewrite to reach for. */
export interface AiTellFlag {
  path: string
  phrase: string
  suggestion: string
}

export interface ParseFidelityResult {
  /** Paths the parser lost, e.g. `basics.url`, `experience[1].start`. */
  dropped: string[]
  /** How many fields were compared — the denominator in "2 of 14 fields dropped". */
  checked: number
  verdict: CheckVerdict
}

export interface CoverageResult {
  matched: string[]
  missing: string[]
}

/* The per-kind shapes stored in `CheckOutcome.details` (and, JSON-encoded, in
 * `CheckResult.details`). Consumers narrow on `kind`. */

export type ParseFidelityDetail = ParseFidelityResult

export interface KeywordCoverageDetail extends CoverageResult {
  /** Every JD term considered, so the panel can show coverage as a whole. */
  terms: string[]
}

export interface FormatLintDetail {
  issues: FormatIssue[]
}

export interface AiTellDetail {
  flags: AiTellFlag[]
}

export interface MatchRatingDetail {
  tier: FitTier
  reasons: FitReason[]
}

export interface CheckDetailByKind {
  parse_fidelity: ParseFidelityDetail
  keyword_coverage: KeywordCoverageDetail
  format_lint: FormatLintDetail
  ai_tell: AiTellDetail
  match_rating: MatchRatingDetail
}

export type CheckDetail = CheckDetailByKind[CheckKind]

/**
 * One instrument reading.
 *
 * `details` is `unknown` because this object is persisted as JSON and read back
 * from a column, so consumers must narrow rather than trust; `CheckDetailByKind`
 * says what to narrow to. Note what is absent and stays absent: no `total`, no
 * `score`, no `percentage`.
 */
export interface CheckOutcome {
  kind: CheckKind
  verdict: CheckVerdict
  /** The concrete count, written for the user: `18 / 22 JD terms`, `clean`. */
  summary: string
  details: unknown
  /**
   * Set when the check could not run at all — no key, no parser, a thrown
   * error. The card still appears, saying it did not measure, rather than
   * vanishing or inventing a pass.
   */
  error?: string
}

/** Every check module exports one of these; `runAllChecks` fans out over them. */
export type CheckRunner = (input: CheckRunInput) => Promise<CheckOutcome>
