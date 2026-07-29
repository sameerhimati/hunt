import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { SourcingWorkspace } from '@/components/sourcing/workspace'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { listResumes, versionTree } from '@/lib/resume/store'
import { listSavedSearches } from '@/lib/sourcing/saved'
import { resolveJobsAdapters } from '@/lib/sourcing/search'
import { isTestMode } from '@/lib/testmode/env'

// Keys, saved searches and résumés all live in SQLite: read on every request.
export const dynamic = 'force-dynamic'

interface ResumeOption {
  id: string
  label: string
}

/**
 * Every résumé version, labelled `Base résumé · Base`, in the order the résumés
 * list shows them. The board rates against exactly one of these, and which one
 * is a URL parameter so the choice survives a reload and can be linked to.
 */
async function resumeOptions(): Promise<ResumeOption[]> {
  const resumes = await listResumes()
  const trees = await Promise.all(resumes.map((resume) => versionTree(resume.id)))

  return resumes.flatMap((resume, index) =>
    trees[index].map((version) => ({
      id: version.id,
      label: `${resume.name} · ${version.label}`,
    })),
  )
}

/** The topbar's right slot: "rated against Base résumé ▾" (`design/Sourcing.dc.html`). */
function RatedAgainst({ options, selected }: { options: ResumeOption[]; selected: ResumeOption }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="rated-against"
        className="font-mono text-xs text-muted-foreground"
      >
        rated against <span className="text-foreground">{selected.label}</span> ▾
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem key={option.id} asChild>
            <Link href={`/sourcing?resume=${option.id}`}>{option.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default async function SourcingPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>
}) {
  // Next 16: searchParams is async.
  const { resume } = await searchParams

  // Fit rating is résumé-vs-job by definition, and the gate boots a wiped data
  // dir. Test mode seeds the fixture résumé so there is something honest to rate
  // against; production shows the "no résumé yet" topbar instead.
  if (isTestMode()) {
    const { ensureFixtureResume } = await import('@/lib/testmode/seed')
    await ensureFixtureResume()
  }

  const [options, jobs, saved] = await Promise.all([
    resumeOptions(),
    resolveJobsAdapters(),
    listSavedSearches(),
  ])

  const selected = options.find((option) => option.id === resume) ?? options[0] ?? null

  return (
    <AppShell
      title="Sourcing"
      action={
        selected ? (
          <RatedAgainst options={options} selected={selected} />
        ) : (
          <Link href="/resumes" className="font-mono text-xs text-muted-foreground">
            no résumé to rate against — add one →
          </Link>
        )
      }
    >
      <div className="px-6 pb-10 pt-5">
        <SourcingWorkspace
          savedSearches={saved}
          resumeVersionId={selected?.id ?? null}
          jobProviders={jobs.configured}
        />
      </div>
    </AppShell>
  )
}
