'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { TEMPLATES } from '@/lib/resume/templates'
import type { ResumeContent } from '@/lib/resume/schema'
import { cn } from '@/lib/utils'

/**
 * The live paper. Re-renders through Tectonic as you type, debounced, and
 * **holds the last good render** while a new one compiles or fails — the
 * preview going blank mid-sentence is the single most disorienting thing a
 * WYSIWYG editor can do.
 *
 * The paper stays light in both themes, because that is what prints.
 */

const DEBOUNCE_MS = 600

interface PdfPreviewFrameProps {
  content: ResumeContent
  templateId: string
  onTemplateChange: (templateId: string) => void
  rawLatexOverride?: string | null
}

export function PdfPreviewFrame({
  content,
  templateId,
  onTemplateChange,
  rawLatexOverride,
}: PdfPreviewFrameProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState(0)
  /**
   * The page count of the first render in this frame. State rather than a ref
   * because it is read while rendering, and growth is measured against the
   * document the user started from — comparing against the previous keystroke
   * would make a page that crept on over six edits look like it was always
   * there, which is precisely the change worth noticing.
   */
  const [floor, setFloor] = useState<number | null>(null)

  const grew = pages > 0 && floor !== null && pages > floor

  useEffect(() => {
    let cancelled = false

    // The "rendering…" flag is raised when the debounce fires, not on every
    // keystroke: flipping it in the effect body would flicker the indicator on
    // and off for edits that never reach the compiler.
    const timer = setTimeout(async () => {
      if (cancelled) return
      setRendering(true)

      try {
        const response = await fetch('/api/resumes/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content, templateId, rawLatexOverride }),
        })

        if (cancelled) return

        if (!response.ok) {
          const detail = await response.json().catch(() => null)
          setError(detail?.error ?? `Render failed (${response.status}).`)
          return
        }

        // Frame the render from its own URL, not from a blob of the body we
        // just received. Safari does not display a PDF framed from `blob:` —
        // it shows blank white paper while every status here reads "live".
        const previewId = response.headers.get('x-hunt-preview-id')
        if (cancelled) return

        if (!previewId) {
          setError('The renderer did not say where to read this preview from.')
          return
        }

        setUrl(`/api/resumes/preview/${previewId}`)
        setError(null)

        // 0 means the renderer could not tell; show nothing rather than a guess.
        const counted = Number(response.headers.get('x-hunt-pages') ?? 0)
        if (counted > 0) {
          setPages(counted)
          setFloor((first) => first ?? counted)
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Render failed.')
      } finally {
        if (!cancelled) setRendering(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [content, templateId, rawLatexOverride])

  return (
    <div data-testid="pdf-preview" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-2/60">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Template</span>
          {TEMPLATES.map((template) => (
            <Button
              key={template.id}
              type="button"
              size="sm"
              variant={template.id === templateId ? 'secondary' : 'ghost'}
              data-testid={`template-${template.id}`}
              title={template.description}
              onClick={() => onTemplateChange(template.id)}
              className="h-7 px-2 text-xs"
            >
              {template.name}
            </Button>
          ))}
        </div>

        {pages > 0 ? (
          <span
            data-testid="page-count"
            data-pages={pages}
            data-grew={grew ? 'true' : 'false'}
            className={cn(
              'shrink-0 font-mono text-[11px]',
              grew ? 'text-warn' : 'text-muted-foreground',
            )}
          >
            {/*
              A count, and — when it has grown — what it grew from. Both are
              facts about the compiled document. Deliberately not "your résumé
              is too long": how many pages a résumé should be is a norm, and an
              opinion dressed as an instrument is what this product refuses.
            */}
            {pages} {pages === 1 ? 'page' : 'pages'}
            {grew ? ` · was ${floor}` : ''}
          </span>
        ) : null}

        <span
          className={cn(
            'font-mono text-xs',
            rendering ? 'text-warn' : error ? 'text-destructive' : 'text-primary',
          )}
        >
          {rendering ? 'rendering…' : error ? 'render failed' : 'live'}
        </span>
      </div>

      {error ? (
        <div className="flex items-start gap-2 border-b border-border bg-warn-bg px-3 py-2 text-xs text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Tectonic could not compile this document.</p>
            <p className="mt-0.5 font-mono text-[11px] leading-relaxed">{error}</p>
            <p className="mt-1 text-muted-foreground">Showing the last good render.</p>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto min-h-[560px] w-full max-w-[640px] bg-white shadow-sm">
          {url ? (
            <iframe
              title="Résumé preview"
              src={url}
              className="h-[640px] w-full"
              data-testid="pdf-preview-frame"
            />
          ) : (
            <div className="flex h-[640px] items-center justify-center">
              <span className="font-mono text-xs text-neutral-400">
                {error ? 'no render yet' : 'compiling your résumé…'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
