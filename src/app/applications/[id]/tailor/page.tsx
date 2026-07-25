import { notFound } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { TailorWorkspace, type TailorResumeOption } from '@/components/tailor/tailor-workspace'
import { resolveLlm } from '@/lib/llm'
import { applicationDetail } from '@/lib/pipeline/board'
import { listResumes, versionTree } from '@/lib/resume/store'

export const dynamic = 'force-dynamic'

/**
 * The tailoring screen — a **sibling route** of the application hub, not part
 * of it. `applications/[id]/page.tsx` is a Wave-1 seam and stays frozen; the
 * hero screen owns its own route, its own actions file, and its own full-height
 * two-pane layout, which would never have fitted inside the hub's card grid.
 */
export default async function TailorPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16: params is async everywhere.
  const { id } = await params

  const application = await applicationDetail(id)
  if (!application) notFound()

  const { job } = application

  // The base picker offers every version of every résumé — tailoring an old
  // version, or a different résumé entirely, is a normal thing to want.
  const rows = await listResumes()
  const resumes: TailorResumeOption[] = await Promise.all(
    rows.map(async (resume) => ({
      id: resume.id,
      name: resume.name,
      versions: (await versionTree(resume.id)).map((version) => ({
        id: version.id,
        resumeId: version.resumeId,
        label: version.label,
        depth: version.depth,
        templateId: version.templateId,
        rawLatexOverride: version.rawLatexOverride,
        content: version.content,
      })),
    })),
  )

  const withVersions = resumes.filter((resume) => resume.versions.length > 0)

  // Resolved on the server so the screen can render the DegradedBanner instead
  // of discovering the missing key only after the user clicks Tailor.
  const hasLlm = (await resolveLlm()) !== null

  return (
    <AppShell title={`${job.company} — ${job.title}`}>
      <TailorWorkspace
        applicationId={application.id}
        job={{ title: job.title, company: job.company }}
        resumes={withVersions}
        initialBaseVersionId={
          application.resumeVersionId ?? withVersions[0]?.versions[0]?.id ?? null
        }
        hasLlm={hasLlm}
        defaultLabel={`${job.company} — ${job.title}`}
      />
    </AppShell>
  )
}
