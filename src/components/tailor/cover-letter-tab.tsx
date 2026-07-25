'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  draftCoverLetterAction,
  loadCoverLetterAction,
  saveCoverLetterAction,
  type CoverLetterResult,
} from '@/app/applications/[id]/tailor/actions'
import { DegradedBanner } from '@/components/degraded-banner'
import { CitationChip } from '@/components/tailor/citation-chip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { CoverLetterDraft, CoverLetterParagraph } from '@/lib/tailor/cover-letter'
import { cn } from '@/lib/utils'

/**
 * The second tab of a tailor run (TAILORING-DIFF §6).
 *
 * The résumé tab reviews proposals; this one edits a document. Three things
 * follow from that difference:
 *
 *  1. **The paragraph is the unit.** One textarea per paragraph rather than one
 *     for the whole letter, because provenance is per-paragraph: keeping the
 *     boundaries is what keeps a citation attached to the sentences it explains.
 *     Editing is still free text — the user rewrites, cuts or replaces anything,
 *     and nothing here validates their prose.
 *  2. **Sources are an affordance, not furniture.** The chips sit under the
 *     paragraph and fade in on hover or focus, so the letter reads as a letter
 *     until you ask where a claim came from (§6: "hover any sentence to see
 *     which résumé/JD facts it draws on").
 *  3. **A flag is inline and inert.** An unsourced paragraph is marked where it
 *     sits — it is not removed from the letter, it does not block `Save`, and
 *     the copy states the fact and stops. Editing that paragraph makes it the
 *     user's, and the flag goes with hunt's authorship of it.
 *
 * `FabricationFlag` is deliberately not reused: its fixed copy is *"Not added —
 * no source"*, which is true of a refused résumé bullet and false here, where
 * the paragraph stays in the letter unless the user cuts it. Same amber, same
 * one-fact voice, different fact.
 *
 * Values from `src/lib/tailor/cover-letter.ts` arrive through the route's server
 * actions rather than by importing that module — its persistence half touches
 * the filesystem. The actions are injectable so this file is testable without a
 * database (`test/tailor-cover-letter.test.ts`).
 */

export interface CoverLetterActions {
  draft(applicationId: string, versionId: string): Promise<CoverLetterResult>
  save(applicationId: string, draft: CoverLetterDraft): Promise<CoverLetterResult>
  load(applicationId: string): Promise<CoverLetterResult>
}

const SERVER_ACTIONS: CoverLetterActions = {
  draft: draftCoverLetterAction,
  save: saveCoverLetterAction,
  load: loadCoverLetterAction,
}

export interface CoverLetterTabProps {
  applicationId: string
  /** The version the letter is drafted from — the tailored child once saved. */
  baseVersionId: string
  job: { title: string; company: string }
  /**
   * Known upfront by the page the way the résumé tab knows it. Optional because
   * the keyless case is also recognisable from the action's own error, and the
   * tab has to degrade whether or not it was told in advance.
   */
  hasLlm?: boolean
  /** Injected by tests; production uses the route's server actions. */
  actions?: CoverLetterActions
}

/** The one error that is a missing key rather than a failure. */
function isKeyless(message: string): boolean {
  return /llm key/i.test(message)
}

export function CoverLetterTab({
  applicationId,
  baseVersionId,
  job,
  hasLlm,
  actions = SERVER_ACTIONS,
}: CoverLetterTabProps) {
  const [draft, setDraft] = useState<CoverLetterDraft | null>(null)
  const [busy, setBusy] = useState<'loading' | 'drafting' | null>('loading')
  const [error, setError] = useState<string | null>(null)
  const [keyless, setKeyless] = useState(hasLlm === false)
  const [dirty, setDirty] = useState(false)
  const [saving, startSaving] = useTransition()

  const receive = useCallback((result: CoverLetterResult): CoverLetterDraft | null => {
    if (result.ok) {
      setError(null)
      return result.draft
    }

    setKeyless(isKeyless(result.error))
    setError(result.error)
    return null
  }, [])

  const generate = useCallback(async () => {
    setBusy('drafting')
    const drafted = receive(await actions.draft(applicationId, baseVersionId))
    if (drafted) {
      setDraft(drafted)
      setDirty(true)
    }
    setBusy(null)
    return drafted
  }, [actions, applicationId, baseVersionId, receive])

  // The run drafts the letter, but not before the user opens the tab: this is a
  // model call, and spending it on a tab nobody looked at is spending the user's
  // money for them. A saved letter always wins over a fresh draft — returning to
  // the tab must never overwrite what was pinned.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    opened.current = true

    void (async () => {
      const existing = receive(await actions.load(applicationId))
      if (existing) {
        setDraft(existing)
        setBusy(null)
        return
      }

      if (hasLlm === false) {
        setBusy(null)
        return
      }

      await generate()
    })()
  }, [actions, applicationId, generate, hasLlm, receive])

  /**
   * The edit rule, in the one place edits happen: the paragraph becomes the
   * user's. Its citations survive — the facts it was built from are still those
   * facts — but the flag does not, because hunt no longer authored the claim
   * (`src/lib/tailor/cover-letter.ts`, rule 2).
   */
  const edit = useCallback((id: string, text: string) => {
    setDirty(true)
    setDraft((current) =>
      current
        ? {
            ...current,
            paragraphs: current.paragraphs.map((paragraph) =>
              paragraph.id === id
                ? { id, text, citations: paragraph.citations, origin: 'user' }
                : paragraph,
            ),
          }
        : current,
    )
  }, [])

  /** An empty page the user owns from the first keystroke — the keyless floor. */
  const startBlank = useCallback(() => {
    setDirty(true)
    setDraft({
      applicationId,
      savedAt: null,
      paragraphs: [{ id: 'p1', text: '', citations: [], origin: 'user' }],
    })
  }, [applicationId])

  const cut = useCallback((id: string) => {
    setDirty(true)
    setDraft((current) =>
      current
        ? { ...current, paragraphs: current.paragraphs.filter((entry) => entry.id !== id) }
        : current,
    )
  }, [])

  const save = useCallback(() => {
    if (!draft) return

    startSaving(async () => {
      const saved = receive(await actions.save(applicationId, draft))
      if (saved) {
        setDraft(saved)
        setDirty(false)
        toast.success('Cover letter saved', {
          description: `Pinned to ${job.company} — ${job.title}.`,
        })
      }
    })
  }, [actions, applicationId, draft, job.company, job.title, receive])

  const flagged = draft?.paragraphs.filter((paragraph) => paragraph.flag) ?? []

  return (
    <div data-testid="cover-letter-tab" className="mx-auto w-full max-w-[760px] px-8 py-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold">Cover letter</h2>
          <p
            data-testid="cover-letter-summary"
            className="mt-1 font-mono text-[11px] text-muted-foreground"
          >
            {draft ? (
              <>
                {draft.paragraphs.length} paragraphs
                {flagged.length > 0 ? (
                  <>
                    {' · '}
                    <span className="text-warn">{flagged.length} unsourced</span>
                  </>
                ) : null}
                {' · '}
                {dirty || !draft.savedAt ? 'unsaved' : 'saved'}
              </>
            ) : (
              `${job.title} at ${job.company}`
            )}
          </p>
        </div>

        {draft ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="regenerate-cover-letter"
              disabled={busy !== null || saving || keyless}
              onClick={() => void generate()}
            >
              {busy === 'drafting' ? 'Drafting…' : 'Regenerate'}
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="save-cover-letter"
              disabled={saving || busy !== null}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : null}
      </div>

      {keyless ? (
        <DegradedBanner
          className="mt-5"
          feature="Drafting a cover letter"
          needs="an LLM key — Anthropic or an OpenAI-compatible endpoint"
          stillWorks="The rest of this run works without one, and a letter you write here yourself saves the same way."
          settingsSection="llm"
        />
      ) : null}

      {error && !keyless ? (
        <div className="mt-5 rounded-md border border-destructive/40 bg-card px-3 py-2.5">
          <p
            data-testid="cover-letter-error"
            className="font-mono text-xs leading-relaxed text-destructive"
          >
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="retry-cover-letter"
            className="mt-2 h-7 text-xs"
            disabled={busy !== null}
            onClick={() => void generate()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {busy === 'drafting' && !draft ? (
        <div data-testid="cover-letter-skeleton" className="mt-6 space-y-5">
          {[0, 1, 2].map((row) => (
            <div key={row} className="space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-[94%]" />
              <Skeleton className="h-3.5 w-[76%]" />
            </div>
          ))}
        </div>
      ) : null}

      {draft ? (
        <div className="mt-6 space-y-5">
          {draft.paragraphs.map((paragraph) => (
            <Paragraph
              key={paragraph.id}
              paragraph={paragraph}
              onEdit={(text) => edit(paragraph.id, text)}
              onCut={() => cut(paragraph.id)}
            />
          ))}

          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
            No salutation and no sign-off — hunt does not guess a hiring manager&rsquo;s name.
            Saving pins the letter to this application, beside the résumé version.
          </p>
        </div>
      ) : null}

      {!draft && busy === null ? (
        <div className="mt-6">
          {!keyless && !error ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              hunt drafts the letter from the résumé version this run produced, and marks what each
              paragraph draws on. Nothing is sent anywhere — you edit it here and save it beside the
              version.
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            {keyless ? null : (
              <Button
                type="button"
                size="sm"
                data-testid="draft-cover-letter"
                onClick={() => void generate()}
              >
                Draft cover letter
              </Button>
            )}

            {/* The keyless floor: no model, but the letter is still the user's to
                write, and it saves and pins exactly the same way. */}
            <Button
              type="button"
              variant={keyless ? 'default' : 'ghost'}
              size="sm"
              data-testid="write-cover-letter"
              onClick={startBlank}
            >
              Write one myself
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface ParagraphProps {
  paragraph: CoverLetterParagraph
  onEdit: (text: string) => void
  onCut: () => void
}

function Paragraph({ paragraph, onEdit, onCut }: ParagraphProps) {
  return (
    <div data-testid="cover-letter-paragraph" data-origin={paragraph.origin} className="group">
      <Textarea
        aria-label="Cover letter paragraph"
        data-testid="cover-letter-input"
        value={paragraph.text}
        onChange={(event) => onEdit(event.target.value)}
        className={cn(
          'min-h-0 resize-none rounded-md border-transparent bg-transparent px-2.5 py-2 font-serif text-sm leading-[1.75] shadow-none md:text-sm',
          'hover:border-border focus-visible:border-ring',
          paragraph.flag ? 'border-warn/35 bg-warn-bg/40' : null,
        )}
      />

      {paragraph.flag ? (
        <div
          data-testid="cover-letter-flag"
          className="mt-1.5 flex items-start gap-2 px-2.5 text-[11px] leading-relaxed text-warn"
        >
          <span
            aria-hidden="true"
            className="mt-px flex size-[15px] shrink-0 items-center justify-center rounded-full bg-warn/15 font-mono text-[10px]"
          >
            !
          </span>
          <span className="min-w-0 flex-1">{paragraph.flag}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="cut-paragraph"
            className="-mt-1 h-6 shrink-0 px-2 text-[11px] text-warn"
            onClick={onCut}
          >
            Cut
          </Button>
        </div>
      ) : null}

      {paragraph.citations.length > 0 ? (
        <div
          data-testid="cover-letter-citations"
          className="mt-1.5 space-y-2 px-2.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Draws on
          </span>
          <div className="flex flex-col gap-2">
            {paragraph.citations.map((citation) => (
              <CitationChip key={citation.path} path={citation.path} snippet={citation.snippet} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
