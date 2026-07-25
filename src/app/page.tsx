import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { FollowUpsPanel } from '@/components/dashboard/follow-ups'
import { FunnelRow } from '@/components/dashboard/funnel-row'
import { NewApplicationDialog } from '@/components/pipeline/new-application-dialog'
import { StatusBadge } from '@/components/pipeline/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { STATUS_LABELS, type ApplicationStatus } from '@/lib/pipeline/status'
import { funnelStats, recentActivity } from '@/lib/pipeline/stats'
import { readAllProviderStates, summarise } from '@/lib/providers/status'

export const dynamic = 'force-dynamic'

/**
 * "What do I do right now?" — the funnel says whether the search is working,
 * the follow-ups queue is the action list, activity is the memory.
 *
 * Before there is anything to measure, a funnel of zeros is noise, so first run
 * gets the EmptyState instead (SCREENS §2). From the first card onwards the
 * numbers are real counts and stay on screen even when they read zero.
 */

function relative(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function Home() {
  const [stats, activity, providers] = await Promise.all([
    funnelStats(),
    recentActivity(8),
    readAllProviderStates().then(summarise),
  ])

  const occupied = Object.entries(stats.byStatus).filter(([, count]) => count > 0)

  if (stats.total === 0) {
    return (
      <AppShell title="Dashboard">
        <EmptyState
          title="Nothing in your sights yet"
          body="hunt runs entirely on this machine. Paste a job posting to start the pipeline — or add the keys you want to use first; nothing leaves the machine either way."
          action={
            <>
              <Link href="/pipeline" className={buttonVariants({ size: 'sm' })}>
                Add your first application
              </Link>
              <Link
                href="/settings"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Set up your keys
              </Link>
            </>
          }
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Dashboard" action={<NewApplicationDialog />}>
      <div className="space-y-4 p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-lg font-semibold">This search</h2>
          <p className="font-mono text-xs text-faint">
            {stats.total} application{stats.total === 1 ? '' : 's'} tracked ·{' '}
            {providers.configured} providers configured
          </p>
        </div>

        <FunnelRow stats={stats} />

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <FollowUpsPanel />

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-medium">Pipeline</h3>
                <Link
                  href="/pipeline"
                  className="font-mono text-xs text-muted-foreground hover:text-primary"
                >
                  Open board →
                </Link>
              </div>

              <ul className="mt-3 space-y-1.5">
                {occupied.map(([status, count]) => (
                  <li key={status} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {STATUS_LABELS[status as ApplicationStatus]}
                    </span>
                    <span className="font-mono text-xs tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-medium">Recent activity</h3>

            {activity.length === 0 ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Nothing has moved yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {activity.map((item) => (
                  <li key={item.applicationId}>
                    <Link
                      href={`/applications/${item.applicationId}`}
                      className="flex items-center justify-between gap-3 rounded-md px-1 py-1 hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{item.company}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.title}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={item.status as ApplicationStatus} />
                        <span className="font-mono text-[11px] text-faint">{relative(item.at)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
