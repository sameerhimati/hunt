import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { ChecksPanel } from '@/components/application/checks-panel'
import { ContactsCard } from '@/components/application/contacts-card'
import { OutreachTimeline } from '@/components/application/outreach-timeline'
import { PinnedResume } from '@/components/application/pinned-resume'
import { StatusSelect } from '@/components/application/status-select'
import { applicationDetail } from '@/lib/pipeline/board'
import type { ApplicationStatus } from '@/lib/pipeline/status'

export const dynamic = 'force-dynamic'

/**
 * The per-application hub. Composed of slot components on purpose: Phase 3
 * replaces `checks-panel.tsx` and Phase 4 replaces `contacts-card.tsx` and
 * `outreach-timeline.tsx` — this file is frozen after Wave 1 so those phases
 * never collide here.
 */

function Milestones({
  application,
}: {
  application: {
    createdAt: Date
    appliedAt: Date | null
    repliedAt: Date | null
    interviewAt: Date | null
    decidedAt: Date | null
  }
}) {
  const entries = [
    ['Added', application.createdAt],
    ['Applied', application.appliedAt],
    ['Replied', application.repliedAt],
    ['Interview', application.interviewAt],
    ['Decided', application.decidedAt],
  ] as const

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Status history</h2>
      <dl className="mt-3 space-y-1.5">
        {entries.map(([label, at]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs text-faint">
              {at ? at.toISOString().slice(0, 10) : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const application = await applicationDetail(id)
  if (!application) notFound()

  const { job } = application

  return (
    <AppShell
      title={`${job.company} — ${job.title}`}
      action={
        <StatusSelect applicationId={application.id} status={application.status as ApplicationStatus} />
      }
    >
      <div className="p-6">
        <nav className="mb-4 font-mono text-xs text-faint">
          <Link href="/pipeline" className="hover:text-muted-foreground">
            Pipeline
          </Link>
          <span className="mx-1.5">/</span>
          <span>
            {job.company} — {job.title}
          </span>
        </nav>

        <header className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-sm text-muted-foreground">
            {job.company.charAt(0).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl font-semibold">{job.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {[job.company, job.location].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-1 font-mono text-xs text-faint">
              from {job.source}
              {job.scrapedAt ? ` · scraped ${job.scrapedAt.toISOString().slice(0, 10)}` : ''}
              {job.url ? (
                <>
                  {' · '}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-muted-foreground"
                  >
                    original posting ↗
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <ChecksPanel />

            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-medium">Job description</h2>

              {job.jdText ? (
                <div className="mt-3 max-h-[520px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {job.jdText}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No description saved. Paste it in and tailoring has something to cite.
                </p>
              )}

              {job.companyBlurb ? (
                <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed">
                  <span className="font-medium">About {job.company}</span> — {job.companyBlurb}
                </p>
              ) : null}
            </section>
          </div>

          <div className="space-y-4">
            <PinnedResume
              resumeId={application.resumeVersion?.resumeId}
              resumeName={application.resumeVersion?.resume.name}
              versionLabel={application.resumeVersion?.label}
            />
            <ContactsCard applicationId={application.id} />
            <OutreachTimeline applicationId={application.id} />
            <Milestones application={application} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
