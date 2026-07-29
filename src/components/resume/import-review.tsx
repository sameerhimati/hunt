'use client'

import { AlertTriangle, Upload } from 'lucide-react'
import { useState, useTransition } from 'react'

import { createResumeFromImport } from '@/app/resumes/actions'
import { DegradedBanner } from '@/components/degraded-banner'
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
  /** The PDF's own text layer, so the review can be checked against something. */
  text: string
  fileName: string
}

const FLAG_BELOW = 1

export function ImportReview() {
  const [parsed, setParsed] = useState<ImportResponse | null>(null)
  const [content, setContent] = useState<ResumeContent | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  /**
   * Distinct from `error` because it is not one. A missing key is a designed
   * state with a remedy one click away, and the route already says so with a
   * 428 — rendering it as red text made the first screen of the app look
   * broken and left the user to find Settings themselves.
   */
  const [needsKey, setNeedsKey] = useState(false)
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
    setNeedsKey(false)

    try {
      const body = new FormData()
      body.set('file', file)

      const response = await fetch('/api/resumes/import', { method: 'POST', body })
      const payload = await response.json()

      if (!response.ok) {
        // The route answers 428 for "no model configured" specifically, which is
        // the whole discriminator needed here — the remedy travels as a status
        // code, so no link has to survive the JSON round-trip.
        if (response.status === 428) {
          setNeedsKey(true)
          return
        }
        setError(payload?.error ?? `Import failed (${response.status}).`)
        return
      }

      const imported = payload as ImportResponse
      setParsed(imported)
      setContent(parseResumeContent(imported.content))
      setName(imported.content.basics?.name || file.name.replace(/\.pdf$/i, ''))
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
          hunt reads the PDF&rsquo;s text and turns it into structured fields you can edit and
          version. You review the parse before anything is saved.
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
            accept="application/pdf,.pdf"
            data-testid="import-file"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Upload size={22} className="text-faint" aria-hidden="true" />
          <span className="text-sm font-medium">
            {dragging ? 'Drop it here' : 'Drop your PDF here, or click to choose'}
          </span>
          <span className="label-mono">PDF · up to 10 MB</span>
        </label>

        {uploading ? (
          // Reading the PDF takes milliseconds; the model reading it back into
          // fields is the ~30s the user is actually waiting on. Saying "reading
          // your PDF" for all of it reads as a hang.
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            reading your PDF, then asking the model to lay it out as fields — around half a minute…
          </p>
        ) : null}

        {needsKey ? (
          <DegradedBanner
            className="mt-4 text-left"
            feature="Importing a PDF"
            needs="an LLM key — Anthropic or an OpenAI-compatible endpoint"
            stillWorks="You can start from a blank résumé and fill it in by hand instead. The editor, the pipeline and public-board search never need a key."
            settingsSection="llm"
          />
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
    <div className="flex h-full min-h-0 flex-col">
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
          {flagged.size > 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-warn">
              <AlertTriangle size={14} aria-hidden="true" />
              {flagged.size} field{flagged.size === 1 ? '' : 's'} not found verbatim in the PDF
            </span>
          ) : (
            <span className="font-mono text-xs text-primary">every field matched the PDF</span>
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
                await createResumeFromImport(name, content)
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
