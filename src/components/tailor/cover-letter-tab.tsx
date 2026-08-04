'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
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
import { auditAiTellText } from '@/lib/checks/ai-tell'
import { MAX_LETTER_WORDS } from '@/lib/llm/prompts/cover-letter'
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
 *     the copy states the fact and stops. *Rewriting* that paragraph makes it
 *     the user's and takes the flag with hunt's authorship of it; merely
 *     touching it does not — see `REWRITTEN_BELOW` below.
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
   * Resolved on the server by `tailor/page.tsx`, the way the résumé tab gets
   * it. Required, because the alternative — opening the tab, spending a model
   * call, and learning from the error that there was never a key — is a round
   * trip the page had the answer to before it rendered.
   */
  hasLlm: boolean
  /** Injected by tests; production uses the route's server actions. */
  actions?: CoverLetterActions
}

/**
 * The line between "the user rewrote this, so it's theirs" and "the user
 * touched this, so the warning disappeared".
 *
 * `cover-letter.ts` rule 2 — the guard judges what hunt wrote — is right about a
 * rewrite and wrong about a keystroke. Applied per-character it is a one-key
 * laundry: the model claims *"I hired and led a team of eight engineers through
 * a replatforming"*, the user fixes a typo in it, and the amber mark and the
 * named unresolvable paths vanish from a sentence that is still 99% the model's
 * invention — saved as the user's own authorship and never flagged again.
 *
 * So the threshold is a **majority of hunt's words**: the paragraph stays hunt's,
 * and stays marked, while more than half the words hunt wrote are still in the
 * box. Fixing a typo, a name, a number or a date leaves the claim standing, so
 * the mark stands with it. Past that point the sentence is the user's own and
 * hunt stops marking it — the opposite failure, flagging text the user genuinely
 * replaced, would be just as dishonest and twice as annoying.
 *
 * Two properties make it hold up rather than just sound reasonable:
 *
 *  - It is measured against **hunt's original text**, not the previous
 *    keystroke. Compared keystroke-to-keystroke every edit retains ~100%, so a
 *    rewrite typed out one word at a time would never lift the mark.
 *  - It counts **what survives of the original**, not string similarity, so
 *    appending a paragraph of the user's own prose to hunt's claim does not
 *    dilute it below the line. The claim is still there; so is the mark.
 */
const REWRITTEN_BELOW = 0.5

const WORDS = /[\p{L}\p{N}'’]+/gu

/**
 * The fraction of `written`'s words still present in `edited`, counted as a
 * multiset so deleting one of two "engineers" costs one word rather than none.
 */
export function retainedFraction(written: string, edited: string): number {
  const original = written.toLowerCase().match(WORDS) ?? []
  if (original.length === 0) return 0

  const remaining = new Map<string, number>()
  for (const word of edited.toLowerCase().match(WORDS) ?? []) {
    remaining.set(word, (remaining.get(word) ?? 0) + 1)
  }

  let kept = 0
  for (const word of original) {
    const left = remaining.get(word) ?? 0
    if (left === 0) continue
    remaining.set(word, left - 1)
    kept += 1
  }

  return kept / original.length
}

/**
 * The letter's live word count, summed over the paragraphs as they currently read.
 *
 * Counted here rather than stored on the draft because the number has to survive
 * an edit: a count written at draft time is wrong the moment the user cuts a
 * sentence, and the store reconstructs a reloaded letter from markdown without
 * ever passing through the parser (`cover-letter-store.ts`), so a stored field
 * would come back missing as well. Recomputing is exact and costs nothing.
 */
export function letterWords(paragraphs: Array<{ text: string }>): number {
  return paragraphs.reduce((total, paragraph) => total + (paragraph.text.match(WORDS)?.length ?? 0), 0)
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
  const [keyless, setKeyless] = useState(!hasLlm)
  const [dirty, setDirty] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [saving, startSaving] = useTransition()

  /**
   * What hunt wrote, for every paragraph it flagged — the baseline
   * `retainedFraction` measures against. Entries survive a save (the round trip
   * returns the *edited* text, and re-baselining on it would let a flag be
   * walked off in two saves), and are dropped on a regenerate, where the ids are
   * reused for entirely different sentences.
   */
  const authored = useRef(new Map<string, string>())

  const adopt = useCallback((next: CoverLetterDraft, { fresh = false } = {}) => {
    const previous = fresh ? new Map<string, string>() : authored.current
    const marks = new Map<string, string>()
    for (const paragraph of next.paragraphs) {
      if (paragraph.origin !== 'model' || !paragraph.flag) continue
      marks.set(paragraph.id, previous.get(paragraph.id) ?? paragraph.text)
    }

    authored.current = marks
    setDraft(next)
  }, [])

  const receive = useCallback((result: CoverLetterResult): CoverLetterDraft | null => {
    if (result.ok) {
      setError(null)
      return result.draft
    }

    // Only ever escalates. The key can disappear between the page load that
    // resolved it and this call, but it cannot come back without a reload —
    // and clearing the state on the next unrelated failure would take the
    // banner off a screen that still has no model behind it.
    if (result.keyless) setKeyless(true)
    setError(result.error)
    return null
  }, [])

  const generate = useCallback(async () => {
    setConfirmRegenerate(false)
    setBusy('drafting')
    const drafted = receive(await actions.draft(applicationId, baseVersionId))
    if (drafted) {
      adopt(drafted, { fresh: true })
      setDirty(true)
    }
    setBusy(null)
    return drafted
  }, [actions, adopt, applicationId, baseVersionId, receive])

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
        adopt(existing, { fresh: true })
        setBusy(null)
        return
      }

      if (!hasLlm) {
        setBusy(null)
        return
      }

      await generate()
    })()
  }, [actions, adopt, applicationId, generate, hasLlm, receive])

  /**
   * The edit rule, in the one place edits happen: the paragraph becomes the
   * user's. Its citations survive — the facts it was built from are still those
   * facts — and so does the flag, until the rewrite has actually replaced the
   * claim hunt was flagged for (`REWRITTEN_BELOW`). A paragraph that keeps its
   * flag keeps `origin: 'model'` with it, or the mark would return this session
   * and be gone from every future load of the saved file.
   */
  const edit = useCallback((id: string, text: string) => {
    setDirty(true)
    setDraft((current) =>
      current
        ? {
            ...current,
            paragraphs: current.paragraphs.map((paragraph) => {
              if (paragraph.id !== id) return paragraph

              const written = authored.current.get(id)
              if (written !== undefined && retainedFraction(written, text) > REWRITTEN_BELOW) {
                return { ...paragraph, text }
              }

              return { ...paragraph, text, origin: 'user', flag: undefined }
            }),
          }
        : current,
    )
  }, [])

  /** An empty page the user owns from the first keystroke — the keyless floor. */
  const startBlank = useCallback(() => {
    setDirty(true)
    authored.current = new Map()
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
        adopt(saved)
        setDirty(false)
        toast.success('Cover letter saved', {
          description: `Pinned to ${job.company} — ${job.title}.`,
        })
      }
    })
  }, [actions, adopt, applicationId, draft, job.company, job.title, receive])

  const flagged = draft?.paragraphs.filter((paragraph) => paragraph.flag) ?? []
  /** Shown always, warned on past the ceiling — the prompt asks for it, this is the check. */
  const words = letterWords(draft?.paragraphs ?? [])
  const overLong = words > MAX_LETTER_WORDS
  /** Prose of the user's own that a regenerate would replace. Blank lines are nothing to lose. */
  const handwritten =
    draft?.paragraphs.filter((paragraph) => paragraph.origin === 'user' && paragraph.text.trim())
      .length ?? 0

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
                {' · '}
                <span className={cn(overLong && 'text-warn')}>
                  {words} words{overLong ? ` · past ${MAX_LETTER_WORDS}` : ''}
                </span>
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
              onClick={() => {
                // A regenerate replaces every paragraph and there is no undo,
                // so it asks first when there is writing of the user's to lose.
                if (handwritten > 0) setConfirmRegenerate(true)
                else void generate()
              }}
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
          // Either LLM key unblocks this — see the workspace's banner.
          settingsSection="llm"
        />
      ) : null}

      {/* Same shape as the Structured tab's hand-edit banner in the workspace:
          state the fact, then offer the destructive move and the way out. */}
      {confirmRegenerate ? (
        <div
          data-testid="regenerate-confirm"
          className="mt-5 rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn"
        >
          Regenerating replaces the whole letter, including the{' '}
          {handwritten === 1 ? 'paragraph' : `${handwritten} paragraphs`} you wrote. There is no
          undo.
          <div className="mt-1 flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="confirm-regenerate"
              className="h-7 px-2 text-xs"
              onClick={() => void generate()}
            >
              Discard my edits and regenerate
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="cancel-regenerate"
              className="h-7 px-2 text-xs"
              onClick={() => setConfirmRegenerate(false)}
            >
              Keep my letter
            </Button>
          </div>
        </div>
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

/**
 * The AI-tell audit, per paragraph, at render.
 *
 * Computed rather than stored, for two reasons. It is a pure function of the
 * text, so persisting it would create a second copy that goes stale the moment
 * the user types — and the user types constantly here, since the paragraph *is*
 * the editable artifact. And the reading has to track the edit: a person who
 * takes the suggestion and replaces "leverage" with "used" should watch the
 * flag go away as they do it, which is the whole feedback loop. Cheap enough to
 * run on every keystroke — a dozen word-bounded regexes over one paragraph —
 * and `auditAiTellText` has no runtime imports, so pulling it into the client
 * bundle costs the pattern list and nothing else.
 *
 * It runs on every paragraph regardless of `origin`, unlike the provenance flag
 * beside it. Those two guards answer different questions. Provenance asks *did
 * hunt author an uncited claim*, which is only ever hunt's business — the user
 * may write what they like about their own life. A tell is style advice with a
 * rewrite attached, and it has been offered on the user's own résumé text since
 * the check shipped; withholding it on a paragraph they edited would make the
 * instrument arbitrary.
 */
function Paragraph({ paragraph, onEdit, onCut }: ParagraphProps) {
  const tells = useMemo(
    () => auditAiTellText(paragraph.text, paragraph.id),
    [paragraph.text, paragraph.id],
  )

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

      {tells.length > 0 ? (
        <ul data-testid="cover-letter-tells" className="mt-1.5 space-y-1 px-2.5">
          {tells.map((tell, index) => (
            <li
              key={`${tell.phrase}-${index}`}
              className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground"
            >
              <span aria-hidden="true" className="mt-px shrink-0 font-mono text-[10px]">
                ~
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-foreground">“{tell.phrase}”</span> reads like
                LLM boilerplate. {tell.suggestion}
              </span>
            </li>
          ))}
        </ul>
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
