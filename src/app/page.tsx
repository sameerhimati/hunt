import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { FollowUpsPanel } from '@/components/dashboard/follow-ups'
import { FunnelRow } from '@/components/dashboard/funnel-row'
import { NewApplicationDialog } from '@/components/pipeline/new-application-dialog'
import { StatusBadge } from '@/components/pipeline/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { STATUS_LABELS, type ApplicationStatus } from '@/lib/pipeline/status'
import { onboardingComplete } from '@/lib/onboarding/state'
import { funnelStats, recentActivity } from '@/lib/pipeline/stats'
import { getProvider, requiredFields } from '@/lib/providers/registry'
import { readAllProviderStates, type ProviderState } from '@/lib/providers/status'
import { countResumes } from '@/lib/resume/store'

export const dynamic = 'force-dynamic'

/**
 * "What do I do right now?" — the funnel says whether the search is working,
 * the follow-ups queue is the action list, activity is the memory.
 *
 * One route, three faces (SCREENS §2). A funnel of zeros is noise, so the
 * dashboard only draws itself once there is something to measure, and until
 * then it answers the same question with the one thing that is actually next.
 * What it routes on is what the user *has*, not just the application count:
 * with no résumé, "add your first application" points past the wedge — the
 * résumé is the thing every other screen consumes.
 *
 * Deliberately not a wizard and not a checklist: each face is a single
 * EmptyState with real exits, and no step of it is required to move on. That
 * still holds, and is not contradicted by the first-run wizard this page
 * redirects to: the wizard runs **once**, on a cold boot, and answers "what is
 * this and what do I give it?". These faces run forever and answer "what is
 * missing right now?" — which is the question a user who skipped the import, or
 * archived their last résumé two months in, still needs answered.
 */

/**
 * The no-key case is a sentence on the other two faces, never a face of its own.
 * A screen that led with "add a key" would say the app is gated on one, and it
 * isn't: the résumé editor, the whole pipeline and public-board search all work
 * keyless. Settings stays on offer as the secondary action, at default weight.
 */
const KEYLESS_NOTE =
  ' You have no keys set, and none are needed for any of this — the résumé editor, the pipeline and public-board search all run without one. Keys add AI tailoring, scraping and outreach when you want them.'

/**
 * Providers the user actually had to supply something for.
 *
 * `free_boards` is live and declares no required field, so it reads as
 * "configured" from the first boot — counting it told a user with zero keys they
 * had one provider set up. Every number on this screen is a real count of
 * something the user did (DESIGN.md §7), and this one wasn't.
 */
function configuredKeys(states: ProviderState[]): number {
  return states.filter((state) => {
    if (state.status !== 'configured') return false
    const meta = getProvider(state.id)
    return meta !== undefined && requiredFields(meta).length > 0
  }).length
}

function relative(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function Home() {
  // First boot lands in the wizard. Only this route redirects: a stranger opens
  // the app at its root, and guarding every route with middleware would trap
  // someone who deliberately deep-linked to Settings to add a key mid-setup.
  if (!(await onboardingComplete())) redirect('/onboarding')

  const [stats, activity, providerStates, resumeCount] = await Promise.all([
    funnelStats(),
    recentActivity(8),
    readAllProviderStates(),
    countResumes(),
  ])

  const occupied = Object.entries(stats.byStatus).filter(([, count]) => count > 0)
  const keys = configuredKeys(providerStates)
  const keyless = keys === 0 ? KEYLESS_NOTE : ''

  if (resumeCount === 0) {
    return (
      <AppShell title="Dashboard">
        <EmptyState
          title="Start with your résumé"
          body={`Everything else here points at one: tailoring branches from it, and each application pins the exact version you sent. Import the PDF you already have, or start from a blank document.${keyless}`}
          action={
            <>
              <Link
                href="/resumes"
                data-testid="empty-state-cta"
                className={buttonVariants({ size: 'sm' })}
              >
                Add your résumé
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

  if (stats.total === 0) {
    return (
      <AppShell title="Dashboard">
        <EmptyState
          title="Nothing in your sights yet"
          body={`Your résumé is in. Paste a job posting and the pipeline starts — tailor to it, track it, follow up. It all runs on this machine.${keyless}`}
          action={
            <>
              {/*
                The dialog itself, not a link to the screen that holds it: this
                is the one action the empty state exists for, and bouncing the
                user to /pipeline so they can press New application again is a
                step that buys nothing.
              */}
              <NewApplicationDialog testId="empty-state-cta" label="Add your first application" />
              <Link
                href="/sourcing"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Search public boards
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
            {keys === 0 ? 'no keys set' : `${keys} key${keys === 1 ? '' : 's'} set`}
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
