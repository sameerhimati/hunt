import { Archive, FileText, Upload } from 'lucide-react'
import Link from 'next/link'

import { archiveResumeAction, restoreResumeAction } from '@/app/resumes/actions'
import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { DeleteResumeButton } from '@/components/resume/delete-resume-button'
import { NewResumeDialog } from '@/components/resume/new-resume-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { listArchivedResumes, listResumes, resumeApplicationCount } from '@/lib/resume/store'

export const dynamic = 'force-dynamic'

function relative(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default async function ResumesPage() {
  const [resumes, archived] = await Promise.all([listResumes(), listArchivedResumes()])

  // Only the shelf needs this: an archived résumé an application still points at
  // can never be deleted, and the row has to say so instead of offering a button
  // that fails. One count per archived résumé, and the shelf is small by nature.
  const pinnedCounts = await Promise.all(
    archived.map((resume) => resumeApplicationCount(resume.id)),
  )

  return (
    <AppShell
      title="Résumés"
      action={
        resumes.length > 0 ? (
          <div className="flex items-center gap-2">
            <Link
              href="/resumes/import"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Upload size={15} aria-hidden="true" />
              Import PDF
            </Link>
            <NewResumeDialog />
          </div>
        ) : null
      }
    >
      <div className="flex h-full flex-col">
        {resumes.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={FileText}
            title="No résumé yet"
            body="Start from a blank document, or import the PDF you already have — hunt parses it into structured fields you can edit and version."
            action={
              <>
                <NewResumeDialog />
                <Link
                  href="/resumes/import"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <Upload size={15} aria-hidden="true" />
                  Import a PDF
                </Link>
              </>
            }
          />
        ) : (
          <div className="grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-3">
            {resumes.map((resume) => {
              const children = resume.versions.filter((version) => version.parentVersionId).length

              return (
                <div key={resume.id} className="relative">
                  <Link
                    href={`/resumes/${resume.id}`}
                    data-testid="resume-card"
                    className="block rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/50"
                  >
                    <h2 className="pr-8 font-serif text-lg font-semibold">{resume.name}</h2>

                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {resume.versions.length} version{resume.versions.length === 1 ? '' : 's'}
                      {children > 0 ? ` · ${children} tailored` : ''}
                    </p>
                    <p className="mt-1 font-mono text-xs text-faint">
                      edited {relative(resume.updatedAt)}
                    </p>
                  </Link>

                  {/* Outside the Link, not inside it — a button nested in an
                      anchor is invalid and swallows the card's own click. */}
                  <form
                    action={archiveResumeAction.bind(null, resume.id)}
                    className="absolute right-2 top-2"
                  >
                    <button
                      type="submit"
                      data-testid="archive-resume"
                      title={`Archive ${resume.name}`}
                      aria-label={`Archive ${resume.name}`}
                      className={cn(
                        buttonVariants({ variant: 'ghost', size: 'icon' }),
                        'size-8 text-faint',
                      )}
                    >
                      <Archive size={15} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}

        {archived.length > 0 ? (
          <details data-testid="archived-resumes" className="border-t border-border px-6 py-4">
            <summary className="cursor-pointer font-mono text-xs text-muted-foreground">
              Archived ({archived.length})
            </summary>

            <p className="mt-2 max-w-prose text-xs leading-relaxed text-faint">
              Archived résumés stay out of the way but stay whole — every application still shows
              the exact version it was sent.
            </p>

            <ul className="mt-3 space-y-1">
              {archived.map((resume, index) => {
                const pinned = pinnedCounts[index]

                return (
                  <li
                    key={resume.id}
                    data-testid="archived-resume-row"
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-1.5 hover:bg-surface-2"
                  >
                    <Link href={`/resumes/${resume.id}`} className="text-sm hover:text-primary">
                      {resume.name}
                    </Link>
                    <span className="font-mono text-xs text-faint">
                      {resume.versions.length} version{resume.versions.length === 1 ? '' : 's'}
                    </span>

                    <span className="ml-auto flex items-center gap-1">
                      <form action={restoreResumeAction.bind(null, resume.id)}>
                        <button
                          type="submit"
                          data-testid="restore-resume"
                          className={buttonVariants({ variant: 'outline', size: 'sm' })}
                        >
                          Restore
                        </button>
                      </form>

                      {pinned === 0 ? (
                        <DeleteResumeButton
                          resumeId={resume.id}
                          name={resume.name}
                          versionCount={resume.versions.length}
                        />
                      ) : (
                        <span
                          data-testid="delete-blocked"
                          className="px-2 font-mono text-xs text-faint"
                        >
                          kept — {pinned} application{pinned === 1 ? '' : 's'} pin a version
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  )
}
