import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { ResumeEditor } from '@/components/resume/resume-editor'
import { getResume, resumeSource, versionTree } from '@/lib/resume/store'

export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: params is async everywhere.
  const { id } = await params

  const resume = await getResume(id)
  if (!resume) notFound()

  const versions = await versionTree(id)
  // Resolved here rather than in the client: the source text is the whole
  // document and has no business crossing into the bundle just to decide
  // whether one button renders.
  const source = await resumeSource(id)

  return (
    <AppShell title="Résumés">
      <ResumeEditor
        resume={{ id: resume.id, name: resume.name }}
        versions={versions}
        canReRead={source !== null}
      />
    </AppShell>
  )
}
