import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

/**
 * Which résumé went to this job — the provenance the whole product is built on.
 * Before a version is pinned it says so plainly and offers the way to fix that,
 * rather than rendering an empty card.
 */
export function PinnedResume({
  resumeId,
  resumeName,
  versionLabel,
}: {
  resumeId?: string | null
  resumeName?: string | null
  versionLabel?: string | null
}) {
  return (
    <section data-testid="pinned-resume" className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Pinned résumé</h2>

      {resumeId && versionLabel ? (
        <>
          <p className="mt-2 text-sm">
            {resumeName}
            <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {versionLabel}
            </span>
          </p>
          <Link
            href={`/resumes/${resumeId}`}
            className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-3`}
          >
            Open in editor
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            No version pinned yet. Tailoring a résumé to this job pins the exact version it
            produced, so months from now you know what you actually sent.
          </p>
          <Link
            href="/resumes"
            className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-3`}
          >
            Open résumés
          </Link>
        </>
      )}
    </section>
  )
}
