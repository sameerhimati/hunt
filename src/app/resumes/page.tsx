import { FileText, Upload } from 'lucide-react'
import Link from 'next/link'

import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { NewResumeDialog } from '@/components/resume/new-resume-dialog'
import { buttonVariants } from '@/components/ui/button'
import { listResumes } from '@/lib/resume/store'

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
  const resumes = await listResumes()

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
      {resumes.length === 0 ? (
        <EmptyState
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
              <Link
                key={resume.id}
                href={`/resumes/${resume.id}`}
                data-testid="resume-card"
                className="rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-serif text-lg font-semibold">{resume.name}</h2>
                  <FileText size={16} className="mt-1 shrink-0 text-faint" aria-hidden="true" />
                </div>

                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {resume.versions.length} version{resume.versions.length === 1 ? '' : 's'}
                  {children > 0 ? ` · ${children} tailored` : ''}
                </p>
                <p className="mt-1 font-mono text-xs text-faint">
                  edited {relative(resume.updatedAt)}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
