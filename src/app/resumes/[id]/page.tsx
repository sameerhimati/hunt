import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { ResumeEditor } from '@/components/resume/resume-editor'
import { getResume, versionTree } from '@/lib/resume/store'

export const dynamic = 'force-dynamic'

export default async function ResumePage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: params is async everywhere.
  const { id } = await params

  const resume = await getResume(id)
  if (!resume) notFound()

  const versions = await versionTree(id)

  return (
    <AppShell title="Résumés">
      <ResumeEditor resume={{ id: resume.id, name: resume.name }} versions={versions} />
    </AppShell>
  )
}
