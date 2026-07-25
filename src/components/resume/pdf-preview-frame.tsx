'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

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
  const objectUrl = useRef<string | null>(null)

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

        const blob = await response.blob()
        if (cancelled) return

        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = URL.createObjectURL(blob)
        setUrl(objectUrl.current)
        setError(null)
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

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

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
