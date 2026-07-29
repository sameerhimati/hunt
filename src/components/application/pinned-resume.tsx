'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Which résumé went to this job — the provenance the whole product is built on.
 *
 * This card is also the only entry point into tailoring: the mockup draws
 * "Tailor résumé" in the application topbar, but the application page is frozen,
 * and SCREENS §4 puts the CTA on this card anyway ("pre-tailor → pinned résumé
 * shows 'base v1, not yet tailored' + Tailor CTA"). So the link lives here, and
 * it resolves its own href from the route rather than demanding a new prop from
 * the frozen call site.
 */
export function PinnedResume({
  resumeId,
  resumeName,
  versionLabel,
  company,
  applicationId,
  compact = false,
}: {
  resumeId?: string | null
  resumeName?: string | null
  versionLabel?: string | null
  company?: string | null
  applicationId?: string | null
  compact?: boolean
}) {
  const tailorHref = useTailorHref(applicationId)
  const pinned = Boolean(resumeId && versionLabel)

  return (
    <section
      data-testid="pinned-resume"
      className={cn(
        'rounded-xl border border-border bg-card',
        compact ? 'px-4 py-3' : 'px-[18px] py-4',
      )}
    >
      <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Pinned résumé
      </h2>

      {pinned ? (
        <>
          <div className="mt-3 flex items-center gap-[11px]">
            {/* the paper thumbnail — a page, not an icon */}
            <div
              aria-hidden
              className={cn(
                'shrink-0 rounded-[4px] border border-border bg-surface-2',
                compact ? 'h-9 w-7' : 'h-12 w-[38px]',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">
                {company ? `${resumeName} — ${company}` : resumeName}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-primary">
                {versionLabel} · tailored from base
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-[7px]">
            <Link
              href={`/resumes/${resumeId}`}
              className={cn(buttonVariants({ size: 'sm' }), 'flex-1')}
            >
              Open
            </Link>
            <Link
              data-testid="tailor-resume"
              href={tailorHref}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'flex-1')}
            >
              Re-tailor
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed">
            <span className="font-medium">{resumeName ?? 'base v1'}</span>
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
              Not yet tailored
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Tailoring pins the exact version this job saw, so months from now you know what you
            actually sent.
          </p>
          <Link
            data-testid="tailor-resume"
            href={tailorHref}
            className={cn(buttonVariants({ size: 'sm' }), 'mt-3 w-full')}
          >
            Tailor résumé
          </Link>
        </>
      )}
    </section>
  )
}

/**
 * `/applications/<id>/…` → `/applications/<id>/tailor`. The application page
 * can't hand us its id (its call site is frozen), and the tailor workspace
 * renders this card one level deeper, so both cases fall out of the path.
 */
function useTailorHref(applicationId?: string | null) {
  const pathname = usePathname()
  if (applicationId) return `/applications/${applicationId}/tailor`
  const id = pathname?.match(/^\/applications\/([^/]+)/)?.[1]
  return id ? `/applications/${id}/tailor` : '/pipeline'
}
