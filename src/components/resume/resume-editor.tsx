'use client'

import { GitCompare, Save, Sparkles, X } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  reReadWithModelAction,
  saveVersionAction,
  updateVersionAction,
} from '@/app/resumes/actions'
import { DiffRow } from '@/components/resume/diff-row'
import { PdfPreviewFrame } from '@/components/resume/pdf-preview-frame'
import { StructuredEditor } from '@/components/resume/structured-editor'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { semanticDiff } from '@/lib/resume/diff'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'
import { renderTex } from '@/lib/resume/tex'
import type { VersionNode } from '@/lib/resume/store'
import { DEFAULT_TEMPLATE_ID } from '@/lib/resume/templates'
import { cn } from '@/lib/utils'

/**
 * The Overleaf split: version tree · structured editor · live PDF.
 *
 * One deliberate departure from a document editor: **there is no autosave into
 * a saved version.** Versions are snapshots — an Application pins one and the
 * tree shows where each came from — so quietly rewriting the version you are
 * standing on would erase the lineage the tree exists to prove. Edits live in
 * the draft until you either snapshot them (Save version, the common case) or
 * explicitly overwrite the version you're on.
 */

interface ResumeEditorProps {
  resume: { id: string; name: string }
  versions: VersionNode[]
  /**
   * Whether a stored source document exists to read again. False for a résumé
   * started from scratch and for one imported before the source was kept —
   * neither is an error, so the action hides rather than failing when pressed.
   */
  canReRead: boolean
}

function contentOf(version: VersionNode): ResumeContent {
  return parseResumeContent(JSON.parse(version.content))
}

export function ResumeEditor({
  resume,
  versions: initialVersions,
  canReRead,
}: ResumeEditorProps) {
  const [versions, setVersions] = useState(initialVersions)
  const [currentId, setCurrentId] = useState(initialVersions[0].id)

  const current = versions.find((version) => version.id === currentId) ?? versions[0]

  const [draft, setDraft] = useState<ResumeContent>(() => contentOf(current))
  const [templateId, setTemplateId] = useState(current.templateId ?? DEFAULT_TEMPLATE_ID)
  const [rawLatex, setRawLatex] = useState<string | null>(current.rawLatexOverride)
  const [dirty, setDirty] = useState(false)

  const [saveOpen, setSaveOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [comparing, setComparing] = useState(false)
  const [compareFrom, setCompareFrom] = useState(initialVersions[0].id)
  const [pending, startTransition] = useTransition()

  const [rereading, setRereading] = useState(false)

  /**
   * Read the stored source again with a model, then *show the difference*.
   *
   * The result is a new version, never a replacement, so the honest thing to do
   * with it is put it side by side with what the user already had rather than
   * swap the document under them. Landing straight in compare mode — new version
   * selected, the parse it came from on the left — makes accepting it an act
   * rather than a default, which is the same posture the tailor diff takes.
   */
  const reRead = () => {
    setRereading(true)

    void reReadWithModelAction(resume.id)
      .then((result) => {
        if (result.error || !result.versionId || !result.tree) {
          toast.error(result.error ?? 'That did not work.')
          return
        }

        // Compare against what the user had before this ran, not against the
        // new version's parent — they are the same row today, and saying so
        // here keeps that true if lineage ever changes.
        const from = currentId

        setVersions(result.tree)
        setCurrentId(result.versionId)
        setDraft(parseResumeContent(JSON.parse(
          result.tree.find((version) => version.id === result.versionId)?.content ?? '{}',
        )))
        setDirty(false)
        setCompareFrom(from)
        setComparing(true)
        toast.success(
          result.lowConfidence?.length
            ? `Read again. ${result.lowConfidence.length} field${result.lowConfidence.length === 1 ? '' : 's'} the document does not say verbatim — check ${result.lowConfidence.slice(0, 3).join(', ')}.`
            : 'Read again. Every field appears verbatim in your document.',
        )
      })
      .catch(() => toast.error('That did not work.'))
      .finally(() => setRereading(false))
  }

  const switchTo = (versionId: string) => {
    const target = versions.find((version) => version.id === versionId)
    if (!target) return

    setCurrentId(versionId)
    setDraft(contentOf(target))
    setTemplateId(target.templateId ?? DEFAULT_TEMPLATE_ID)
    setRawLatex(target.rawLatexOverride)
    setDirty(false)
    setComparing(false)
  }

  const changes = useMemo(() => {
    const from = versions.find((version) => version.id === compareFrom)
    if (!from) return []
    return semanticDiff(contentOf(from), draft)
  }, [versions, compareFrom, draft])

  const saveNewVersion = () => {
    startTransition(async () => {
      const { version, tree } = await saveVersionAction({
        resumeId: resume.id,
        parentVersionId: current.id,
        label,
        content: draft,
        templateId,
        rawLatexOverride: rawLatex,
      })

      setVersions(tree)
      setCurrentId(version.id)
      setDirty(false)
      setSaveOpen(false)
      setLabel('')
      toast.success(`Saved “${version.label}”`)
    })
  }

  const overwriteCurrent = () => {
    startTransition(async () => {
      await updateVersionAction({
        versionId: current.id,
        content: draft,
        templateId,
        rawLatexOverride: rawLatex,
      })

      setVersions((previous) =>
        previous.map((version) =>
          version.id === current.id
            ? { ...version, content: JSON.stringify(draft), templateId, rawLatexOverride: rawLatex }
            : version,
        ),
      )
      setDirty(false)
      toast.success(`Updated “${current.label}”`)
    })
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Version tree */}
      <aside className="flex w-[188px] shrink-0 flex-col border-r border-border bg-card">
        <h2 className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Versions
        </h2>

        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {versions.map((version) => (
            <li key={version.id} data-testid="version-node">
              <button
                type="button"
                onClick={() => switchTo(version.id)}
                style={{ paddingLeft: `${8 + version.depth * 12}px` }}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors duration-150',
                  version.id === current.id
                    ? 'bg-surface-2 text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2/60',
                )}
              >
                {version.depth > 0 ? (
                  <span aria-hidden="true" className="text-faint">
                    ↳
                  </span>
                ) : null}
                <span className="truncate">{version.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="space-y-0.5 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="compare-versions"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setComparing((open) => !open)}
          >
            <GitCompare size={14} aria-hidden="true" />
            {comparing ? 'Close compare' : 'Compare two →'}
          </Button>

          {canReRead ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="re-read-with-model"
              disabled={rereading}
              className="w-full justify-start text-muted-foreground"
              onClick={reRead}
            >
              <Sparkles size={14} aria-hidden="true" />
              {rereading ? 'Reading…' : 'Re-read with a model'}
            </Button>
          ) : null}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-border">
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{resume.name}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {current.label}
            </span>
            <span className={cn('font-mono text-[11px]', dirty ? 'text-warn' : 'text-faint')}>
              {pending ? 'saving…' : dirty ? 'unsaved changes' : 'saved'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!dirty || pending}
              onClick={overwriteCurrent}
            >
              Update this version
            </Button>
            <Button
              type="button"
              size="sm"
              data-testid="save-version"
              onClick={() => setSaveOpen(true)}
            >
              <Save size={14} aria-hidden="true" />
              Save version
            </Button>
          </div>
        </div>

        {comparing ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Comparing</span>
                <select
                  data-testid="compare-from"
                  value={compareFrom}
                  onChange={(event) => setCompareFrom(event.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.label}
                    </option>
                  ))}
                </select>
                <span className="text-muted-foreground">→ {current.label} (open draft)</span>
              </div>

              <Button type="button" variant="ghost" size="icon" onClick={() => setComparing(false)}>
                <X size={15} aria-hidden="true" />
                <span className="sr-only">Close compare</span>
              </Button>
            </div>

            {changes.length === 0 ? (
              <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
                These two versions are identical.
              </p>
            ) : (
              <ul className="space-y-2">
                {changes.map((change, index) => (
                  <DiffRow key={`${change.path}-${index}`} change={change} />
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Tabs defaultValue="structured" className="min-h-0 flex-1 gap-0 overflow-hidden">
            <TabsList variant="line" className="h-9 shrink-0 border-b border-border px-3">
              <TabsTrigger value="structured" data-testid="tab-structured">
                Structured
              </TabsTrigger>
              <TabsTrigger value="raw" data-testid="tab-raw-latex">
                raw LaTeX
                <span className="ml-1.5 rounded bg-surface-2 px-1 font-mono text-[10px] text-faint">
                  adv
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="structured" className="min-h-0 flex-1 overflow-y-auto">
              <StructuredEditor
                content={draft}
                onChange={(next) => {
                  setDraft(next)
                  setDirty(true)
                }}
              />
            </TabsContent>

            <TabsContent value="raw" className="min-h-0 flex-1 overflow-y-auto p-4">
              <div
                data-testid="raw-latex-warning"
                className="mb-3 rounded-md border border-warn/40 bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn"
              >
                Editing the LaTeX will <strong>detach</strong> this version from structured
                editing: hunt renders your .tex verbatim and stops regenerating it from the fields.
                Tailoring and checks still work — they read the structured content, which stays as
                it was. Clear the override to re-attach.
              </div>

              <Textarea
                data-testid="raw-latex-input"
                spellCheck={false}
                value={rawLatex ?? renderTex({ content: draft, templateId })}
                onChange={(event) => {
                  setRawLatex(event.target.value)
                  setDirty(true)
                }}
                className="min-h-[420px] font-mono text-xs"
              />

              {rawLatex !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setRawLatex(null)
                    setDirty(true)
                  }}
                >
                  Re-attach to structured editing
                </Button>
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <PdfPreviewFrame
        content={draft}
        templateId={templateId}
        rawLatexOverride={rawLatex}
        onTemplateChange={(next) => {
          setTemplateId(next)
          setDirty(true)
        }}
      />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Save a version</DialogTitle>
            <DialogDescription>
              Snapshots the draft as a child of “{current.label}”. Name it after the job you are
              aiming at — that name is what you&rsquo;ll recognise months later.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-2">
            <Label htmlFor="version-label">Version name</Label>
            <Input
              id="version-label"
              data-testid="version-label-input"
              value={label}
              placeholder="Stripe — Senior Backend Engineer"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              data-testid="confirm-save-version"
              disabled={pending}
              onClick={saveNewVersion}
            >
              Save version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
