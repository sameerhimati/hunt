'use client'

import { AlertTriangle, Upload } from 'lucide-react'
import { useState, useTransition } from 'react'

import { createResumeFromImport } from '@/app/resumes/actions'
import { StructuredEditor } from '@/components/resume/structured-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseResumeContent, type ResumeContent } from '@/lib/resume/schema'
import { cn } from '@/lib/utils'

/**
 * Import review — the screen between "we parsed your PDF" and "this is now your
 * résumé".
 *
 * The amber flags are a measured fact, not a model's opinion of itself: every
 * field is checked back against the PDF's own text, and the ones that don't
 * appear verbatim are the ones worth your eyes. Nothing is written until you
 * say so, so a bad parse costs a click.
 */

interface ImportResponse {
  content: ResumeContent
  fieldConfidence: Record<string, number>
  /** The document's own text, so the review can be checked against something. */
  text: string
  fileName: string
  /**
   * Which parser read it. `layout` means the structure came from the document's
   * own typography and no model was involved — a stronger claim than `model`,
   * and one the user is entitled to see rather than infer.
   */
  parser: 'layout' | 'model'
}

const FLAG_BELOW = 1

/** Recorded alongside the source text so the re-read action can name the file type. */
function kindOf(fileName: string): string {
  return /\.docx$/i.test(fileName) ? 'docx' : 'pdf'
}

interface ImportReviewProps {
  hasModel: boolean
  /**
   * Called instead of creating the résumé and navigating away. The onboarding
   * wizard passes this so confirming the import advances the wizard rather than
   * dropping the user into the résumé editor mid-first-run; `/resumes/import`
   * leaves it unset and keeps the redirect it has always done.
   */
  onImported?: (input: { name: string; content: ResumeContent; text: string; kind: string }) => void
  /** The wizard's gate addresses this input by its own name. */
  fileInputTestId?: string
}

export function ImportReview({
  hasModel,
  onImported,
  fileInputTestId = 'import-file',
}: ImportReviewProps) {
  const [parsed, setParsed] = useState<ImportResponse | null>(null)
  const [content, setContent] = useState<ResumeContent | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [pending, startTransition] = useTransition()

  const flagged = new Set(
    Object.entries(parsed?.fieldConfidence ?? {})
      .filter(([, score]) => score < FLAG_BELOW)
      .map(([path]) => path),
  )

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      const body = new FormData()
      body.set('file', file)

      const response = await fetch('/api/resumes/import', { method: 'POST', body })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.error ?? `Import failed (${response.status}).`)
        return
      }

      const imported = payload as ImportResponse
      setParsed(imported)
      setContent(parseResumeContent(imported.content))
      setName(imported.content.basics?.name || file.name.replace(/\.(pdf|docx)$/i, ''))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed.')
    } finally {
      setUploading(false)
    }
  }

  if (!parsed || !content) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h2 className="font-serif text-xl font-semibold">Import your résumé</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          hunt reads your résumé&rsquo;s own layout and turns it into structured fields you can
          edit and version — <span className="text-foreground">no API key needed</span>. You
          review the parse before anything is saved.
        </p>

        {/*
          A label wrapping a visually-hidden input, rather than a bare file
          input: the browser default renders an unstyled "Choose File" button
          with the filename in a monospace box beside it, which reads as
          unfinished on the first screen a new user meets. SCREENS.md §1 calls
          for a PDF *drop*, so dropping has to actually work — and the input
          stays focusable so this is still reachable by keyboard.
        */}
        <label
          data-testid="import-dropzone"
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) void upload(file)
          }}
          className={cn(
            'mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 transition-colors',
            uploading
              ? 'pointer-events-none border-border opacity-60'
              : 'cursor-pointer hover:border-faint hover:bg-card',
            dragging ? 'border-primary bg-primary/5' : 'border-border',
            'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40',
          )}
        >
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            data-testid={fileInputTestId}
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Upload size={22} className="text-faint" aria-hidden="true" />
          <span className="text-sm font-medium">
            {dragging ? 'Drop it here' : 'Drop your résumé here, or click to choose'}
          </span>
          <span className="label-mono">PDF or .docx · up to 10 MB</span>
        </label>

        {uploading ? (
          // Reading the layout takes milliseconds. A model re-reading it is the
          // ~30s the user is actually waiting on — so only promise that wait
          // when there is a model configured to cause it.
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {hasModel
              ? 'reading your résumé, then asking the model to lay it out as fields — around half a minute…'
              : 'reading your résumé…'}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div data-testid="import-review" className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Label htmlFor="import-name" className="text-xs text-muted-foreground">
            Résumé name
          </Label>
          <Input
            id="import-name"
            data-testid="import-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 w-64"
          />
        </div>

        <div className="flex items-center gap-3">
          {/*
            Which parser ran is the user's business, not an implementation
            detail: "no model was involved" is a materially different claim from
            "a model laid this out", and this screen is where they are asked to
            trust the result.
          */}
          <span className="label-mono" data-testid="import-parser">
            {parsed.parser === 'layout' ? 'read from the layout · no model' : 'laid out by a model'}
          </span>

          {flagged.size > 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-warn">
              <AlertTriangle size={14} aria-hidden="true" />
              {flagged.size} field{flagged.size === 1 ? '' : 's'} not found verbatim in your résumé
            </span>
          ) : (
            <span className="font-mono text-xs text-primary">
              every field matched your résumé
            </span>
          )}

          <Button
            type="button"
            variant="ghost"
            data-testid="toggle-source"
            onClick={() => setShowSource((open) => !open)}
            aria-pressed={showSource}
          >
            {showSource ? 'Hide the PDF text' : 'Compare with the PDF text'}
          </Button>

          <Button
            type="button"
            data-testid="confirm-import"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                // The source text rides along so the résumé can be read again
                // with a model later; without it a keyless import dead-ends.
                const source = parsed
                  ? { text: parsed.text, kind: kindOf(parsed.fileName) }
                  : undefined

                if (onImported) {
                  onImported({ name, content, text: source?.text ?? '', kind: source?.kind ?? 'pdf' })
                  return
                }

                await createResumeFromImport(name, content, source)
              })
            }
          >
            Looks right — create résumé
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StructuredEditor
            content={content}
            onChange={setContent}
            lowConfidencePaths={flagged}
          />
        </div>

        {/*
          The source, side by side rather than behind a link: the amber flags
          say which fields to check, and this is the only thing they can be
          checked against. Reading it is the whole job of this screen.
        */}
        {showSource ? (
          <aside className="min-h-0 w-[38%] shrink-0 overflow-y-auto border-l border-border bg-card">
            <p className="label-mono sticky top-0 border-b border-border bg-card px-4 py-3">
              Text read from {parsed.fileName}
            </p>
            <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {parsed.text}
            </pre>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
