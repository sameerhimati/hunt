'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import type {
  AiTellDetail,
  CheckOutcome,
  CheckVerdict,
  FormatLintDetail,
  KeywordCoverageDetail,
  ParseFidelityDetail,
} from '@/lib/checks/types'
import type { CheckKind } from '@/lib/db/enums'
import { cn } from '@/lib/utils'

/**
 * One instrument reading (SCREENS §7, `Application Detail.dc.html`).
 *
 * The card is the honesty pillar in miniature: a verdict dot, the **concrete
 * count** in mono — `2 of 14 fields dropped`, `18 / 22 JD terms`, `clean` — and
 * specifics you can expand and act on. There is no score, no grade, and no
 * rollup for these cards to feed; each one is named for the single thing it
 * measured and says only that.
 *
 * Copy rule, enforced by review: every unflattering reading is stated as a
 * measurement with a fix beside it. "Two fields didn't survive the parser, here
 * they are" — never "your résumé scored poorly", never a word about what the
 * user should have done.
 *
 * Contract the panel and the e2e gate rely on:
 *  - carries `data-testid="check-card"`, and **only the four measurable checks
 *    do** — match rating renders as `<MatchRatingCard/>`, because the gate
 *    counts these exactly
 *  - renders in a not-run state before any result exists, so the panel is never
 *    an empty box and the count never races a slow check
 */

/** The four kinds that render as a check card. `match_rating` is not one of them. */
export type CheckCardKind = Exclude<CheckKind, 'match_rating'>

export interface CheckCardProps {
  kind: CheckCardKind
  /** The reading, once taken. Absent = not run yet. */
  outcome?: CheckOutcome | null
  /** A sweep is in flight — this card shows a skeleton where its count goes. */
  running?: boolean
  /** Parse fidelity opens expanded, per the mockup. */
  defaultExpanded?: boolean
  /** Enables the deep links from specifics into the exact résumé field. */
  resumeId?: string | null
  onRun: () => void
}

interface CheckCopy {
  name: string
  /** The muted qualifier beside the name — "vs JD". */
  qualifier?: string
  /** One line on what the instrument actually did, shown when expanded. */
  blurb: string
}

const COPY: Record<CheckCardKind, CheckCopy> = {
  parse_fidelity: {
    name: 'Parse fidelity',
    blurb:
      'We rendered your PDF, ran it back through an open-source ATS parser, and compared what came out against your structured data.',
  },
  keyword_coverage: {
    name: 'Keyword coverage',
    qualifier: 'vs JD',
    blurb:
      'The words this posting uses, checked literally against your résumé. A missing term means that exact word is not on the page — not that you lack the skill.',
  },
  format_lint: {
    name: 'Format lint',
    blurb:
      'Objective format rules only: bullet length, date shapes, repeated lines. Nothing here has an opinion about your writing.',
  },
  ai_tell: {
    name: 'AI-tell audit',
    blurb:
      'Phrases that pattern-match LLM boilerplate, each with a shorter way to say the same thing. Take the rewrite or leave it.',
  },
}

const VERDICT_DOT: Record<CheckVerdict, string> = {
  pass: 'bg-pass',
  warn: 'bg-warn',
  fail: 'bg-fail',
}

const VERDICT_TEXT: Record<CheckVerdict, string> = {
  pass: 'text-pass',
  warn: 'text-warn',
  fail: 'text-fail',
}

/**
 * A deep link to the exact field, using the same id the structured editor
 * builds for it — so the anchor lands on the input rather than the top of the
 * document. Slugging must stay identical to `structured-editor.tsx`.
 */
export function resumeFieldHref(resumeId: string | null | undefined, path: string): string | null {
  if (!resumeId) return null
  return `/resumes/${resumeId}#field-${path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
}

/** The dot that carries the verdict. Hollow when nothing has been measured. */
export function VerdictDot({ verdict }: { verdict?: CheckVerdict | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        verdict ? VERDICT_DOT[verdict] : 'border border-faint',
      )}
    />
  )
}

/**
 * The shared row chrome: dot, name, count slot, chevron. Exported so the match
 * rating card sits on exactly the same baseline without borrowing the testid
 * that the gate counts.
 */
export function CheckRow({
  name,
  qualifier,
  verdict,
  expandable,
  expanded,
  onToggle,
  children,
}: {
  name: string
  qualifier?: string
  verdict?: CheckVerdict | null
  expandable: boolean
  expanded: boolean
  onToggle: () => void
  /** The right-hand slot: the count, a skeleton, or the per-check Run control. */
  children: ReactNode
}) {
  const content = (
    <>
      <VerdictDot verdict={verdict} />
      <span className="flex-1 text-left text-sm font-semibold">
        {name}
        {qualifier ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{qualifier}</span>
        ) : null}
      </span>
      {children}
      {expandable ? (
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={cn('shrink-0 text-faint transition-transform', expanded && 'rotate-180')}
        />
      ) : null}
    </>
  )

  if (!expandable) {
    return <div className="flex items-center gap-2.5">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center gap-2.5 text-left"
    >
      {content}
    </button>
  )
}

/** The per-check Run control shown before anything has been measured. */
function RunControl({ kind, onRun }: { kind: string; onRun: () => void }) {
  return (
    <button
      type="button"
      data-testid={`run-check-${kind}`}
      onClick={onRun}
      className="rounded border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
    >
      Run
    </button>
  )
}

export function CheckCard({
  kind,
  outcome,
  running = false,
  defaultExpanded = false,
  resumeId,
  onRun,
}: CheckCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const copy = COPY[kind]
  const expandable = Boolean(outcome) && !running

  return (
    <div
      data-testid="check-card"
      data-check-kind={kind}
      className="border-b border-border px-4 py-3 last:border-b-0"
    >
      <CheckRow
        name={copy.name}
        qualifier={copy.qualifier}
        verdict={outcome?.verdict}
        expandable={expandable}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      >
        {running ? (
          <Skeleton className="h-3 w-28" data-testid="check-skeleton" />
        ) : outcome ? (
          <span
            data-testid="check-count"
            className={cn('font-mono text-xs', VERDICT_TEXT[outcome.verdict])}
          >
            {outcome.summary}
          </span>
        ) : (
          <RunControl kind={kind} onRun={onRun} />
        )}
      </CheckRow>

      {expandable && expanded && outcome ? (
        <div data-testid="check-specifics" className="mt-2.5 space-y-2 pl-5">
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.blurb}</p>
          {outcome.error ? (
            <p className="text-xs leading-relaxed text-warn">{outcome.error}</p>
          ) : (
            <Specifics kind={kind} details={outcome.details} resumeId={resumeId} />
          )}
        </div>
      ) : null}
    </div>
  )
}

function Specifics({
  kind,
  details,
  resumeId,
}: {
  kind: CheckCardKind
  details: unknown
  resumeId?: string | null
}) {
  switch (kind) {
    case 'parse_fidelity':
      return <ParseFidelitySpecifics details={details} resumeId={resumeId} />
    case 'keyword_coverage':
      return <KeywordCoverageSpecifics details={details} />
    case 'format_lint':
      return <FormatLintSpecifics details={details} resumeId={resumeId} />
    case 'ai_tell':
      return <AiTellSpecifics details={details} resumeId={resumeId} />
  }
}

/** A specific with a path, and the link that opens the field it names. */
function FieldRow({
  path,
  resumeId,
  children,
}: {
  path: string
  resumeId?: string | null
  children: ReactNode
}) {
  const href = resumeFieldHref(resumeId, path)

  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed">
      <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-warn" />
      <span className="min-w-0 flex-1">
        {children}{' '}
        {href ? (
          <Link
            href={href}
            data-testid="check-fix-link"
            className="font-mono text-[11px] text-primary underline-offset-2 hover:underline"
          >
            {path} →
          </Link>
        ) : (
          <span className="font-mono text-[11px] text-faint">{path}</span>
        )}
      </span>
    </li>
  )
}

function ParseFidelitySpecifics({
  details,
  resumeId,
}: {
  details: unknown
  resumeId?: string | null
}) {
  const value = details as ParseFidelityDetail | null
  const dropped = Array.isArray(value?.dropped) ? value.dropped : []

  if (dropped.length === 0) {
    return (
      <p className="text-xs leading-relaxed">
        Every field survived the round trip. Whatever an ATS does with this document, it is reading
        the same data you are.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {dropped.map((path) => (
        <FieldRow key={path} path={path} resumeId={resumeId}>
          The parser did not return this field — it is on your page but not in the data an ATS
          extracts.
        </FieldRow>
      ))}
    </ul>
  )
}

function KeywordCoverageSpecifics({ details }: { details: unknown }) {
  const value = details as KeywordCoverageDetail | null
  const missing = Array.isArray(value?.missing) ? value.missing : []
  const matched = Array.isArray(value?.matched) ? value.matched : []

  return (
    <div className="space-y-2">
      {missing.length > 0 ? (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            not on the page
          </p>
          <ul className="mt-1 flex flex-wrap gap-1" data-testid="coverage-missing">
            {missing.map((term) => (
              <li
                key={term}
                className="rounded-sm border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[11px] text-warn"
              >
                {term}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            If any of these are true of you, the word belongs in the bullet where you did it — a
            tailoring run will suggest exactly that.
          </p>
        </div>
      ) : null}

      {matched.length > 0 ? (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            found
          </p>
          <ul className="mt-1 flex flex-wrap gap-1" data-testid="coverage-matched">
            {matched.map((term) => (
              <li
                key={term}
                className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {term}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function FormatLintSpecifics({ details, resumeId }: { details: unknown; resumeId?: string | null }) {
  const value = details as FormatLintDetail | null
  const issues = Array.isArray(value?.issues) ? value.issues : []

  if (issues.length === 0) {
    return (
      <p className="text-xs leading-relaxed">
        Nothing tripped a rule. Margins, bullet lengths and date formats are all consistent.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {issues.map((issue, index) => (
        <FieldRow key={`${issue.code}-${issue.path}-${index}`} path={issue.path} resumeId={resumeId}>
          {issue.detail}
        </FieldRow>
      ))}
    </ul>
  )
}

function AiTellSpecifics({ details, resumeId }: { details: unknown; resumeId?: string | null }) {
  const value = details as AiTellDetail | null
  const flags = Array.isArray(value?.flags) ? value.flags : []

  if (flags.length === 0) {
    return (
      <p className="text-xs leading-relaxed">
        No boilerplate phrasing matched. This reads like a person wrote it.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {flags.map((flag, index) => (
        <li key={`${flag.path}-${index}`} className="text-xs leading-relaxed">
          <span className="font-serif text-warn">“{flag.phrase}”</span>
          <span className="mt-0.5 block text-muted-foreground">{flag.suggestion}</span>
          {resumeFieldHref(resumeId, flag.path) ? (
            <Link
              href={resumeFieldHref(resumeId, flag.path) as string}
              data-testid="check-fix-link"
              className="mt-0.5 inline-block font-mono text-[11px] text-primary underline-offset-2 hover:underline"
            >
              {flag.path} →
            </Link>
          ) : (
            <span className="mt-0.5 inline-block font-mono text-[11px] text-faint">{flag.path}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
