'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { resolveLlm } from '@/lib/llm'
import { modelRequired } from '@/lib/llm/unavailable'
import { importResumeText } from '@/lib/resume/import'
import { ResumeImportError, type ImportedResume } from '@/lib/resume/import-core'
import { parseResumeContent, emptyResume, type ResumeContent } from '@/lib/resume/schema'
import {
  archiveResume,
  createResume,
  deleteResume,
  latestVersion,
  restoreResume,
  resumeSource,
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

export async function createResumeFromImport(
  name: string,
  content: unknown,
  source?: { text: string; kind?: string },
) {
  const resume = await createResume(name.trim() || 'Imported résumé', parseResumeContent(content), {
    // Stored so the keyless import has an upgrade path — see `Resume.sourceText`
    // and `reReadWithModelAction`. Without it, "I have a key now" has nothing to
    // act on but the file, which the user may no longer have.
    sourceText: source?.text,
    sourceKind: source?.kind,
  })

  revalidatePath('/resumes')
  redirect(`/resumes/${resume.id}`)
}

/**
 * Read the stored source again, this time with a model.
 *
 * The point of the whole feature: a keyless import is the floor, not the
 * ceiling, and until now there was no way to say *"I have a key now, try
 * again."* The heuristics read typography and cannot invent; a model reads
 * prose and often does better on a messy document — and can invent, which is
 * why the result lands as **a new version rather than a replacement**. The old
 * parse stays on the tree, the semantic diff shows exactly what changed, and
 * the user accepts it by using it. Nothing is overwritten on their behalf.
 *
 * `fieldConfidence` comes back with it, and it is a measured thing, not a
 * model's opinion of itself: every extracted string is checked back against the
 * source text, so a field the model produced that the document does not contain
 * is visible as such. That check matters more here than at import, because this
 * is the path where a model is second-guessing a parse the user already has.
 */
export async function reReadWithModelAction(resumeId: string): Promise<{
  versionId?: string
  tree?: VersionNode[]
  lowConfidence?: string[]
  error?: string
}> {
  const source = await resumeSource(resumeId)
  if (!source) {
    return { error: 'This résumé has no stored source document to read again.' }
  }

  const llm = await resolveLlm()
  if (!llm) {
    return {
      error: modelRequired('Reading your résumé again', 'the import you already have is unaffected'),
    }
  }

  let imported: ImportedResume
  try {
    imported = await importResumeText(source.text, llm)
  } catch (error) {
    return {
      error:
        error instanceof ResumeImportError
          ? error.message
          : 'The model could not read this résumé. The version you have is unchanged.',
    }
  }

  const parent = await latestVersion(resumeId)
  const version = await saveVersion({
    resumeId,
    content: imported.content,
    label: `Re-read with ${llm.model}`,
    parentVersionId: parent?.id ?? null,
    templateId: parent?.templateId ?? undefined,
  })

  revalidatePath(`/resumes/${resumeId}`)
  revalidatePath('/resumes')

  return {
    versionId: version.id,
    tree: await versionTree(resumeId),
    // Named, not counted: "3 fields need checking" sends the user hunting, and
    // these are exactly the fields where the model may have written something
    // the document never said.
    lowConfidence: Object.entries(imported.fieldConfidence)
      .filter(([, score]) => score < 1)
      .map(([path]) => path),
  }
}

/**
 * Retiring a résumé is archive, not delete — see `deleteResume`. Bound with
 * `.bind(null, id)` from a plain `<form>`, so it needs no client bundle and no
 * confirm: nothing is lost, and Restore sits one disclosure away.
 */
export async function archiveResumeAction(resumeId: string): Promise<void> {
  await archiveResume(resumeId)
  revalidatePath('/resumes')
}

export async function restoreResumeAction(resumeId: string): Promise<void> {
  await restoreResume(resumeId)
  revalidatePath('/resumes')
}

/**
 * The irreversible one. The store refuses when any application pins a version,
 * so this returns the refusal rather than throwing it at the user as a 500.
 */
export async function deleteResumeAction(resumeId: string): Promise<{ error?: string }> {
  try {
    await deleteResume(resumeId)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not delete this résumé.' }
  }

  revalidatePath('/resumes')
  return {}
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
