'use client'

import { ArrowLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { runTailorAction, saveTailoredVersionAction } from '@/app/applications/[id]/tailor/actions'
import { PinnedResume } from '@/components/application/pinned-resume'
import { DegradedBanner } from '@/components/degraded-banner'
import { PdfPreviewFrame } from '@/components/resume/pdf-preview-frame'
import { StructuredEditor } from '@/components/resume/structured-editor'
import { ChangeInspector } from '@/components/tailor/change-inspector'
import { CoverLetterTab } from '@/components/tailor/cover-letter-tab'
import { DiffRow } from '@/components/tailor/diff-row'
import { FabricationFlag } from '@/components/tailor/fabrication-flag'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'
import { DEFAULT_TEMPLATE_ID } from '@/lib/resume/templates'
import { renderTex } from '@/lib/resume/tex'
import { applyChangesWithReport, type SkippedChange } from '@/lib/tailor/apply'
import type { TailorChange, TailorRun } from '@/lib/tailor/types'
import { cn } from '@/lib/utils'

/**
 * The hero screen (`design/Tailoring.dc.html`, TAILORING-DIFF.md §2–§9).
 *
 * All run state lives here, and three invariants shape it:
 *
 *  1. **The PDF is fed `applyChangesWithReport(base, accepted)`.** Not the
 *     model's text, not the raw run — the same function that writes the saved
 *     version. A refused claim therefore cannot reach the paper even if the
 *     review UI had a bug, because it is never in the accepted subset; and a
 *     change that could not land is demoted here rather than left reading as
 *     accepted, because the count and the document have to agree.
 *  2. **Refusals render as `<FabricationFlag/>`, never as a `diff-row`.** They
 *     are visible — hiding them would lie about what the model attempted — but
 *     they are not decisions the user can take.
 *  3. **Saving does not navigate away.** The version is pinned in place beside
 *     the still-mounted document, because leaving mid-review to a different
 *     screen loses the reviewer's place and their remaining decisions.
 *  4. **A save is a version, and the same document is never two versions.** The
 *     commit is idempotent from the moment it fires until the decisions on
 *     screen change again — see `commitSignature` below.
 */

export type ChangeDecision = 'pending' | 'accepted' | 'rejected'

export interface TailorBaseVersion {
  id: string
  resumeId: string
  label: string
  depth: number
  templateId: string | null
  rawLatexOverride: string | null
  /** JSON — parsed here rather than on the server so the page stays cheap. */
  content: string
}

export interface TailorResumeOption {
  id: string
  name: string
  versions: TailorBaseVersion[]
}

interface TailorWorkspaceProps {
  applicationId: string
  job: { title: string; company: string }
  resumes: TailorResumeOption[]
  initialBaseVersionId: string | null
  /** False ⇒ the run is gated behind a DegradedBanner, never hidden. */
  hasLlm: boolean
  /** Auto-label for the saved child version (TAILORING-DIFF §7). */
  defaultLabel: string
}

type LeftTab = 'review' | 'structured' | 'raw'

interface ChangeGroup {
  key: string
  label: string
  changes: TailorChange[]
}

/** `experience[0].bullets[3]` → `experience[0]`; `basics.summary` → `basics`. */
function sectionKey(path: string): string {
  const match = /^([A-Za-z]+)(?:\[(\d+)\])?/.exec(path)
  if (!match) return path
  return match[2] === undefined ? match[1] : `${match[1]}[${match[2]}]`
}

function sectionLabel(key: string, content: ResumeContent): string {
  const match = /^([A-Za-z]+)(?:\[(\d+)\])?$/.exec(key)
  if (!match) return key

  const [, section, rawIndex] = match
  const index = rawIndex === undefined ? -1 : Number(rawIndex)

  switch (section) {
    case 'basics':
      return 'Summary'
    case 'experience': {
      const entry = content.experience[index]
      return entry ? `Experience · ${entry.company || entry.title}` : 'Experience'
    }
    case 'education': {
      const entry = content.education[index]
      return entry ? `Education · ${entry.institution}` : 'Education'
    }
    case 'skills': {
      const entry = content.skills[index]
      return entry?.category ? `Skills · ${entry.category}` : 'Skills'
    }
    case 'projects': {
      const entry = content.projects[index]
      return entry ? `Projects · ${entry.name}` : 'Projects'
    }
    case 'custom': {
      const entry = content.custom[index]
      return entry?.title || 'Other'
    }
    default:
      return section
  }
}

/**
 * Groups by résumé section **in the order the model proposed them** — the first
 * group holds the first change. Any other ordering (severity, section order,
 * accepted-first) would reshuffle the list under the reviewer's cursor as they
 * decide, which is the fastest way to make someone accept the wrong hunk.
 */
function groupChanges(changes: TailorChange[], content: ResumeContent): ChangeGroup[] {
  const groups: ChangeGroup[] = []

  for (const change of changes) {
    const key = sectionKey(change.path)
    let group = groups.find((candidate) => candidate.key === key)

    if (!group) {
      group = { key, label: sectionLabel(key, content), changes: [] }
      groups.push(group)
    }

    group.changes.push(change)
  }

  return groups
}

export function TailorWorkspace({
  applicationId,
  job,
  resumes,
  initialBaseVersionId,
  hasLlm,
  defaultLabel,
}: TailorWorkspaceProps) {
  const router = useRouter()

  const versions = useMemo(() => resumes.flatMap((resume) => resume.versions), [resumes])
  const [baseVersionId, setBaseVersionId] = useState(
    initialBaseVersionId ?? versions[0]?.id ?? '',
  )
  const base = versions.find((version) => version.id === baseVersionId) ?? versions[0]

  const [run, setRun] = useState<TailorRun | null>(null)
  const [decisions, setDecisions] = useState<Record<string, ChangeDecision>>({})
  const [history, setHistory] = useState<{ id: string; previous: ChangeDecision }[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ id: string; label: string; resumeId: string } | null>(null)
  /** What the last save reported it could not write. Cleared by a fresh run. */
  const [savedSkips, setSavedSkips] = useState<SkippedChange[]>([])
  /** The `commitSignature` of the last successful save; null until one lands. */
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [runTab, setRunTab] = useState('resume')
  /**
   * Whether the Cover letter tab has ever been opened. It is force-mounted from
   * then on (see the TabsContent below) so that leaving the tab does not throw
   * away an unsaved letter — but not before, because mounting it is what spends
   * the model call, and hunt does not spend it on a tab nobody looked at.
   */
  const [coverOpened, setCoverOpened] = useState(false)
  const [leftTab, setLeftTab] = useState<LeftTab>('review')
  const [templateId, setTemplateId] = useState(base?.templateId ?? DEFAULT_TEMPLATE_ID)
  const [rawLatex, setRawLatex] = useState<string | null>(base?.rawLatexOverride ?? null)
  const [manual, setManual] = useState<ResumeContent | null>(null)

  const [pending, startTransition] = useTransition()

  const baseContent = useMemo<ResumeContent | null>(() => {
    if (!base) return null
    return parseResumeContent(JSON.parse(base.content))
  }, [base])

  const groups = useMemo(
    () => (run && baseContent ? groupChanges(run.changes, baseContent) : []),
    [run, baseContent],
  )
  const ordered = useMemo(() => groups.flatMap((group) => group.changes), [groups])
  const proposed = useMemo(
    () => ordered.filter((change) => change.status === 'proposed'),
    [ordered],
  )
  const accepted = useMemo(
    () => proposed.filter((change) => decisions[change.id] === 'accepted'),
    [proposed, decisions],
  )
  const flagged = useMemo(
    () => ordered.filter((change) => change.status === 'refused' && !dismissed.includes(change.id)),
    [ordered, dismissed],
  )
  /** Accepted plus still-undecided — what "Accept all & save" would commit. */
  const committable = useMemo(
    () => proposed.filter((change) => decisions[change.id] !== 'rejected'),
    [proposed, decisions],
  )

  const pins = useMemo(
    () => new Map(proposed.map((change, index) => [change.id, index + 1])),
    [proposed],
  )

  /**
   * Everything that decides what `saveTailoredVersionAction` would write. Two
   * saves of the same signature are the same document, and `saveVersion` is an
   * unconditional insert — so the second one is a duplicate row, not a version.
   * Comparing it against `savedSignature` is what makes "Saved" a state rather
   * than a label on a button that still fires.
   */
  const commitSignature = useMemo(
    () =>
      JSON.stringify([
        committable.map((change) => change.id),
        templateId,
        rawLatex,
        manual,
      ]),
    [committable, templateId, rawLatex, manual],
  )
  const committed = savedSignature !== null && savedSignature === commitSignature

  /**
   * The document as it currently stands. A hand-edit in the Structured tab wins
   * outright — it is the user's own writing, and silently re-applying the
   * change list over it would delete work they just did.
   */
  const preview = useMemo(() => {
    const nothingSkipped: SkippedChange[] = []
    if (!baseContent) return { content: null, error: null as string | null, skipped: nothingSkipped }
    if (manual) return { content: manual, error: null as string | null, skipped: nothingSkipped }

    try {
      const report = applyChangesWithReport(baseContent, accepted)
      return { content: report.content, error: null as string | null, skipped: report.skipped }
    } catch (cause) {
      return {
        content: baseContent,
        error: cause instanceof Error ? cause.message : 'Could not apply the accepted changes.',
        skipped: nothingSkipped,
      }
    }
  }, [baseContent, manual, accepted])

  /**
   * Changes that are on their way into the document and are not in it: what this
   * render's apply could not place, plus whatever the last save reported (the
   * server reads the base fresh, so it can have moved since the run). Keyed by
   * id, in the order the user reviewed them. A rejected row is never listed —
   * it was not going in either way, and calling that a skip would be noise.
   */
  const skips = useMemo(() => {
    const reported = new Map<string, SkippedChange>()
    for (const entry of [...preview.skipped, ...savedSkips]) reported.set(entry.id, entry)

    return new Map(
      committable.flatMap((change) => {
        const entry = reported.get(change.id)
        return entry ? [[change.id, entry] as const] : []
      }),
    )
  }, [preview.skipped, savedSkips, committable])

  /** Accepted *and* in the document. The only set the summary may call accepted. */
  const landed = useMemo(
    () => accepted.filter((change) => !skips.has(change.id)),
    [accepted, skips],
  )
  /** Undecided and still landable — a skipped row is counted once, in its own bucket. */
  const undecided = useMemo(
    () => committable.filter((change) => decisions[change.id] !== 'accepted' && !skips.has(change.id)),
    [committable, decisions, skips],
  )

  // The undo stack (§9 `u`). Both halves update from render state rather than
  // from inside an updater: React double-invokes updaters in development, and a
  // history push hidden in one would record every decision twice.
  const decide = useCallback(
    (id: string, next: ChangeDecision) => {
      setHistory((entries) => [...entries, { id, previous: decisions[id] ?? 'pending' }])
      setDecisions((current) => ({ ...current, [id]: next }))
    },
    [decisions],
  )

  const undo = useCallback(() => {
    const last = history.at(-1)
    if (!last) return

    setDecisions((current) => ({ ...current, [last.id]: last.previous }))
    setHistory((entries) => entries.slice(0, -1))
  }, [history])

  const move = useCallback(
    (step: number) => {
      if (proposed.length === 0) return

      const index = proposed.findIndex((change) => change.id === selectedId)
      const next = index === -1 ? 0 : (index + step + proposed.length) % proposed.length
      setSelectedId(proposed[next].id)
    },
    [proposed, selectedId],
  )

  const start = useCallback(() => {
    if (!base) return

    setError(null)
    startTransition(async () => {
      const result = await runTailorAction(applicationId, base.id)

      if (!result.ok) {
        setError(result.error)
        return
      }

      setRun(result.run)
      setDecisions({})
      setHistory([])
      setDismissed([])
      setSavedSkips([])
      setSelectedId(result.run.changes.find((change) => change.status === 'proposed')?.id ?? null)
    })
  }, [applicationId, base])

  /**
   * A ref, not `pending`: the ⌘↵ handler is bound to the window and reads the
   * `commit` it closed over, so a second press landing in the same tick as the
   * first would see a stale `pending` and save twice.
   */
  const committing = useRef(false)

  const commit = useCallback(() => {
    if (!base || committable.length === 0) return
    // Already in flight, or already written: either way a second insert would
    // be a duplicate résumé version, not a second decision.
    if (committing.current || savedSignature === commitSignature) return

    const signature = commitSignature
    committing.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveTailoredVersionAction({
          applicationId,
          baseVersionId: base.id,
          accepted: committable,
          label: defaultLabel,
          templateId,
          rawLatexOverride: rawLatex,
          contentOverride: manual,
        })

        if (!result.ok) {
          setError(result.error)
          return
        }

        // Every committable change that landed is now part of the saved
        // document, so the list must say so — leaving rows "pending" after they
        // shipped would misreport what was sent. The ones the server could not
        // place are the mirror image of that, and are demoted instead: marking
        // them accepted would claim the saved version contains text it does not.
        const missed = new Set(result.skipped.map((entry) => entry.id))
        setSavedSkips(result.skipped)
        setDecisions((current) => {
          const next = { ...current }
          for (const change of committable) {
            if (!missed.has(change.id)) next[change.id] = 'accepted'
          }
          return next
        })
        setSaved(result.version)
        setSavedSignature(signature)
        toast.success(
          missed.size === 0
            ? `Saved “${result.version.label}” and pinned it to this application`
            : `Saved “${result.version.label}” without ${missed.size} change${
                missed.size === 1 ? '' : 's'
              } your résumé no longer had a place for`,
        )
      } finally {
        committing.current = false
      }
    })
  }, [
    applicationId,
    base,
    committable,
    commitSignature,
    savedSignature,
    defaultLabel,
    templateId,
    rawLatex,
    manual,
  ])

  // TAILORING-DIFF §9. Bound to the window rather than a focused list so the
  // whole screen is keyboard-drivable; typing in a field is never intercepted.
  useEffect(() => {
    if (!run) return

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return

      if (event.key === 'Escape') {
        router.push(`/applications/${applicationId}`)
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        commit()
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          move(1)
          break
        case 'k':
        case 'ArrowUp':
          move(-1)
          break
        case 'a':
          if (selectedId) decide(selectedId, 'accepted')
          break
        case 'r':
          if (selectedId) decide(selectedId, 'rejected')
          break
        case 'u':
          undo()
          break
        default:
          return
      }

      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run, applicationId, router, commit, move, decide, undo, selectedId])

  if (!base || !baseContent || !preview.content) {
    return (
      <div className="mx-auto max-w-[520px] p-10 text-center">
        <h2 className="font-serif text-lg font-semibold">No résumé to tailor yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Tailoring works against a version of your résumé — import a PDF or start one, then come
          back and this screen has something to cite.
        </p>
        <Link href="/resumes" className="mt-4 inline-block">
          <Button type="button">Open résumés</Button>
        </Link>
      </div>
    )
  }

  const baseResume = resumes.find((resume) => resume.id === base.resumeId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Topbar strip — base picker on the left, the commit on the right. */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/applications/${applicationId}`}
            className="flex items-center gap-1 font-mono text-xs text-faint hover:text-muted-foreground"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            back to the application
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            base:
            <select
              data-testid="base-version-select"
              value={base.id}
              disabled={run !== null}
              onChange={(event) => setBaseVersionId(event.target.value)}
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs disabled:opacity-60"
            >
              {resumes.map((resume) => (
                <optgroup key={resume.id} label={resume.name}>
                  {resume.versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {run ? (
            <>
              <span className="rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground">
                ⌘↵
              </span>
              <Button
                type="button"
                size="sm"
                data-testid="save-tailored-version"
                disabled={committable.length === 0 || pending || committed}
                onClick={commit}
              >
                {/* Honest about what a second press would do: not re-save this
                    document, but branch a second version off the same base. */}
                {saved ? (committed ? 'Saved' : 'Save a new version') : 'Accept all & save'}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {run ? (
        <Tabs
          value={runTab}
          onValueChange={(value) => {
            setRunTab(value)
            if (value === 'cover') setCoverOpened(true)
          }}
          className="min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <TabsList variant="line" className="h-10 shrink-0 border-b border-border px-4">
            <TabsTrigger value="resume" data-testid="tab-resume-changes">
              Résumé changes
              <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                {run.changes.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="cover" data-testid="tab-cover-letter">
              Cover letter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="resume" className="min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0">
              {/* LEFT — review / edit */}
              <div className="flex w-[47%] min-w-0 shrink-0 flex-col border-r border-border">
                <Tabs
                  value={leftTab}
                  onValueChange={(value) => setLeftTab(value as LeftTab)}
                  className="min-h-0 flex-1 gap-0 overflow-hidden"
                >
                  <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border bg-card pr-3">
                    <TabsList variant="line" className="h-9 px-3">
                      <TabsTrigger value="review" data-testid="tab-review-changes">
                        Review changes
                      </TabsTrigger>
                      <TabsTrigger value="structured" data-testid="tab-structured">
                        Structured
                      </TabsTrigger>
                      <TabsTrigger value="raw" data-testid="tab-raw-latex">
                        raw LaTeX
                        <span className="ml-1.5 rounded border border-warn px-1 font-mono text-[9px] text-warn">
                          adv
                        </span>
                      </TabsTrigger>
                    </TabsList>

                    <span
                      data-testid="tailor-summary"
                      className="shrink-0 font-mono text-[10.5px] text-muted-foreground"
                    >
                      {run.changes.length} changes · <span className="text-diff-add">{landed.length}</span>{' '}
                      accepted · {undecided.length} pending ·{' '}
                      <span className="text-warn">{flagged.length}</span> flagged
                      {skips.size > 0 ? <> · {skips.size} not applied</> : null}
                    </span>
                  </div>

                  <TabsContent value="review" className="min-h-0 flex-1 overflow-y-auto p-4">
                    {saved ? (
                      <div className="mb-4 space-y-2">
                        <PinnedResume
                          resumeId={saved.resumeId}
                          resumeName={baseResume?.name}
                          versionLabel={saved.label}
                        />
                        <Link
                          href={`/applications/${applicationId}`}
                          className="inline-block font-mono text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          ← back to {job.company} — {job.title}
                        </Link>
                      </div>
                    ) : null}

                    {error ?? preview.error ? (
                      <div
                        data-testid="tailor-error"
                        className="mb-4 rounded-md border border-destructive/40 bg-card px-3 py-2 text-xs leading-relaxed text-destructive"
                      >
                        <p className="font-mono">{error ?? preview.error}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 px-2 text-xs"
                          onClick={start}
                          disabled={pending}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : null}

                    {groups.length === 0 ? (
                      <p className="rounded-md border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
                        Your résumé already covers this role well — the model proposed nothing worth
                        changing. Not an error; run the checks on the application to see why.
                      </p>
                    ) : null}

                    {groups.map((group) => (
                      <section key={group.key} className="mb-6">
                        <h3 className="label-mono mb-3">{group.label}</h3>

                        <ul className="flex flex-col gap-2.5">
                          {group.changes.map((change) => {
                            if (change.status === 'refused') {
                              if (dismissed.includes(change.id)) return null

                              return (
                                <FabricationFlag
                                  key={change.id}
                                  change={change}
                                  onDismiss={() =>
                                    setDismissed((current) => [...current, change.id])
                                  }
                                  onAddYourself={() => setLeftTab('structured')}
                                />
                              )
                            }

                            const missed = skips.get(change.id)
                            if (missed) {
                              return (
                                <SkippedChangeNotice
                                  key={change.id}
                                  change={change}
                                  index={pins.get(change.id) ?? 0}
                                  reason={missed.reason}
                                  onRetailor={start}
                                  retailoring={pending}
                                />
                              )
                            }

                            const decision = decisions[change.id] ?? 'pending'

                            return (
                              <DiffRow
                                key={change.id}
                                change={change}
                                index={pins.get(change.id) ?? 0}
                                decision={decision}
                                selected={selectedId === change.id}
                                onSelect={() => setSelectedId(change.id)}
                                onAccept={() => decide(change.id, 'accepted')}
                                onReject={() => decide(change.id, 'rejected')}
                                onUndo={() => decide(change.id, 'pending')}
                              >
                                {selectedId === change.id ? (
                                  <ChangeInspector
                                    change={change}
                                    decision={decision}
                                    onAccept={() => decide(change.id, 'accepted')}
                                    onReject={() => decide(change.id, 'rejected')}
                                    onCite={() => setLeftTab('structured')}
                                    refusedInSection={group.changes.filter(
                                      (entry) =>
                                        entry.status === 'refused' && !dismissed.includes(entry.id),
                                    )}
                                  />
                                ) : null}
                              </DiffRow>
                            )
                          })}
                        </ul>
                      </section>
                    ))}
                  </TabsContent>

                  <TabsContent value="structured" className="min-h-0 flex-1 overflow-y-auto">
                    {manual ? (
                      <div className="m-4 rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
                        You have edited this document by hand, so it no longer follows the change
                        list — accepting more changes leaves your text alone, and saving keeps what
                        you wrote.
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 px-2 text-xs"
                          onClick={() => setManual(null)}
                        >
                          Discard my edits and re-apply the accepted changes
                        </Button>
                      </div>
                    ) : null}

                    <StructuredEditor content={preview.content} onChange={setManual} />
                  </TabsContent>

                  <TabsContent value="raw" className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div
                      data-testid="raw-latex-warning"
                      className="mb-3 rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn"
                    >
                      Editing the LaTeX <strong>detaches</strong> the saved version from structured
                      editing: hunt renders your .tex verbatim from then on. The change list still
                      applies to the structured content underneath.
                    </div>

                    <Textarea
                      data-testid="raw-latex-input"
                      spellCheck={false}
                      value={rawLatex ?? renderTex({ content: preview.content, templateId })}
                      onChange={(event) => setRawLatex(event.target.value)}
                      className="min-h-[420px] font-mono text-xs"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* RIGHT — the live paper, fed only what was accepted. */}
              <PdfPreviewFrame
                content={preview.content}
                templateId={templateId}
                rawLatexOverride={rawLatex}
                onTemplateChange={setTemplateId}
              />
            </div>
          </TabsContent>

          {/*
            Force-mounted once opened, and hidden by hand rather than by Radix.
            Every piece of letter state — the draft, the dirty flag, the
            already-drafted latch — is local to the tab, so letting Radix
            unmount it on a trip to Résumé changes would throw away the user's
            prose and spend a second model call redrafting it. `forceMount`
            makes Radix render the panel unconditionally, `hidden` is what still
            takes it out of the layout and off the a11y tree.
          */}
          <TabsContent
            value="cover"
            forceMount={coverOpened || undefined}
            hidden={runTab !== 'cover'}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <CoverLetterTab
              applicationId={applicationId}
              baseVersionId={saved?.id ?? base.id}
              job={job}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="mx-auto w-full max-w-[560px] p-8">
          <h2 className="font-serif text-lg font-semibold">
            Tailor {baseResume?.name ?? 'this résumé'} to {job.company}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            hunt proposes changes against{' '}
            <span className="font-mono text-xs text-foreground">{base.label}</span>{' '}
            and you review them one at a time. Nothing is rewritten and nothing is saved until you
            say so — and
            any claim it can&rsquo;t trace back to your own résumé is refused, not applied.
          </p>

          {hasLlm ? null : (
            <DegradedBanner
              className="mt-4"
              feature="Tailoring"
              needs="an LLM key — Anthropic or an OpenAI-compatible endpoint"
              stillWorks="Editing this résumé, saving versions, the format and parse checks, and the rest of the pipeline all work without one."
              settingsSection="llm"
            />
          )}

          {error ? (
            <p
              data-testid="tailor-error"
              className="mt-4 rounded-md border border-destructive/40 bg-card px-3 py-2 font-mono text-xs leading-relaxed text-destructive"
            >
              {error}
            </p>
          ) : null}

          {pending ? (
            <ul className="mt-6 flex flex-col gap-2.5">
              {[0, 1, 2].map((row) => (
                <li key={row} className="flex items-start gap-2.5">
                  <Skeleton className="size-[18px] rounded-full" />
                  <Skeleton className={cn('h-10 flex-1', row === 1 && 'h-14')} />
                </li>
              ))}
            </ul>
          ) : (
            <Button
              type="button"
              data-testid="start-tailor"
              className="mt-6"
              disabled={!hasLlm}
              onClick={start}
            >
              <Sparkles size={14} aria-hidden="true" />
              Tailor résumé
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A change the user accepted that the applier had nowhere to put. It takes the
 * place of its own `<DiffRow/>`, keeping its pin number, so the absence is legible
 * where the decision was made — the same move `<FabricationFlag/>` makes, and for
 * the same reason: a change the user reviewed that is not in the document has to
 * be visible, or the count is a lie.
 *
 * Deliberately **not** in the flag's amber: nothing was fabricated here. The
 * validator refuses an unlandable target before it is ever shown, so a skip that
 * survives to this screen means the résumé moved out from under the run — a
 * staleness fact, not a dishonesty one. Like a refusal it carries no
 * `data-testid="diff-row"`: it is no longer a decision the user can take, and
 * `Tailor again` is the way back — a fresh run reads the résumé as it now stands.
 */
function SkippedChangeNotice({
  change,
  index,
  reason,
  onRetailor,
  retailoring,
}: {
  change: TailorChange
  index: number
  /** The applier's own sentence — what it looked for and did not find. */
  reason: string
  onRetailor: () => void
  retailoring: boolean
}) {
  return (
    <li
      data-testid="skipped-change"
      className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-faint"
      >
        {index}
      </span>

      <div className="min-w-0 flex-1">
        {/* `was` for a removal, whose `now` is empty — the text still names the row. */}
        <p className="font-serif text-sm leading-relaxed text-faint">{change.now || change.was}</p>

        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <b>Not applied — that spot is no longer in your résumé.</b> hunt wrote this against the
          version it read when the run started. It was left out rather than put somewhere it might
          fit — tailor again to review this against your résumé as it stands.
        </p>

        <p
          data-testid="skipped-reason"
          className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground"
        >
          {reason}
        </p>

        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="retailor-after-skip"
            className="h-7 text-xs"
            disabled={retailoring}
            onClick={onRetailor}
          >
            Tailor again
          </Button>
        </div>
      </div>
    </li>
  )
}
