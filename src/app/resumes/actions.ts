'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { parseResumeContent, emptyResume, type ResumeContent } from '@/lib/resume/schema'
import {
  createResume,
  saveVersion,
  updateVersionContent,
  versionTree,
  type VersionNode,
} from '@/lib/resume/store'
import { isTestMode } from '@/lib/testmode/env'

/**
 * Server actions for the résumé editor. Mutations only — reads happen in the
 * page components, which already run on the server.
 */

export async function createResumeAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim() || 'Untitled résumé'

  // Seeding the name into `basics` means the first render is a real document
  // with the user's name on it, not an empty page they have to prime.
  // In test mode the seed is a full fixture résumé instead, so gates can
  // arrange through the product and still have something to tailor. Dynamic
  // import so the fixture reader (and `fs`) never enters the production bundle.
  const content = isTestMode()
    ? (await import('@/lib/testmode/seed')).seededResumeContent(name)
    : emptyResume(name)

  const resume = await createResume(name, content)

  revalidatePath('/resumes')
  redirect(`/resumes/${resume.id}`)
}

export async function createResumeFromImport(name: string, content: unknown) {
  const resume = await createResume(name.trim() || 'Imported résumé', parseResumeContent(content))

  revalidatePath('/resumes')
  redirect(`/resumes/${resume.id}`)
}

export interface SaveVersionRequest {
  resumeId: string
  parentVersionId: string
  label: string
  content: ResumeContent
  templateId?: string | null
  rawLatexOverride?: string | null
}

/** Snapshots the draft as a child version and hands the whole tree back. */
export async function saveVersionAction(request: SaveVersionRequest): Promise<{
  version: VersionNode
  tree: VersionNode[]
}> {
  const created = await saveVersion({
    resumeId: request.resumeId,
    parentVersionId: request.parentVersionId,
    label: request.label.trim() || 'Untitled version',
    content: parseResumeContent(request.content),
    templateId: request.templateId,
    rawLatexOverride: request.rawLatexOverride,
  })

  const tree = await versionTree(request.resumeId)
  revalidatePath(`/resumes/${request.resumeId}`)

  return { version: tree.find((node) => node.id === created.id)!, tree }
}

export interface UpdateVersionRequest {
  versionId: string
  content: ResumeContent
  templateId?: string | null
  rawLatexOverride?: string | null
}

/**
 * Overwrites the version being edited. Deliberately explicit — see the editor:
 * versions are snapshots, and an autosave that quietly rewrote one would erase
 * the lineage the version tree exists to show.
 */
export async function updateVersionAction(request: UpdateVersionRequest): Promise<void> {
  const version = await updateVersionContent(
    request.versionId,
    parseResumeContent(request.content),
    { templateId: request.templateId, rawLatexOverride: request.rawLatexOverride },
  )

  revalidatePath(`/resumes/${version.resumeId}`)
}
