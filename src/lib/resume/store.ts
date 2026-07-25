import { prisma } from '@/lib/db/client'

import { parseResumeContent, type ResumeContent } from './schema'
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from './templates'

/**
 * The versioned résumé store.
 *
 * Lineage is the product: an Application pins the exact `ResumeVersion` that
 * was sent, so months later "which résumé got that interview?" is a fact rather
 * than a memory. That means versions are append-only children of a parent, and
 * nothing here ever rewrites a saved version's content.
 */

export interface VersionNode {
  id: string
  resumeId: string
  label: string
  parentVersionId: string | null
  templateId: string | null
  rawLatexOverride: string | null
  content: string
  createdAt: Date
  /** 0 for the base version; +1 per generation. Drives the tree's indentation. */
  depth: number
}

/** The label the base version gets. Children are named by the user or the tailor run. */
export const BASE_VERSION_LABEL = 'Base'

let templatesReady: Promise<void> | null = null

/**
 * The built-in templates are code, but `ResumeVersion.templateId` is a real
 * foreign key — so the code templates are mirrored into the `Template` table
 * on first write. Upsert (not insert) so this stays safe on an existing DB.
 */
function ensureTemplates(): Promise<void> {
  templatesReady ??= (async () => {
    for (const template of TEMPLATES) {
      await prisma.template.upsert({
        where: { id: template.id },
        update: { name: template.name },
        create: { id: template.id, name: template.name, engine: 'latex', source: template.source },
      })
    }
  })().catch((error) => {
    templatesReady = null
    throw error
  })

  return templatesReady
}

export interface SaveVersionInput {
  resumeId: string
  content: ResumeContent
  label: string
  parentVersionId?: string | null
  templateId?: string | null
  /** Hand-edited .tex. Set means this version renders verbatim, detached from the editor. */
  rawLatexOverride?: string | null
}

export async function createResume(
  name: string,
  content: ResumeContent,
  options: { templateId?: string; label?: string } = {},
) {
  await ensureTemplates()

  return prisma.resume.create({
    data: {
      name,
      versions: {
        create: {
          label: options.label ?? BASE_VERSION_LABEL,
          content: JSON.stringify(content),
          templateId: options.templateId ?? DEFAULT_TEMPLATE_ID,
        },
      },
    },
    include: { versions: true },
  })
}

export async function saveVersion(input: SaveVersionInput) {
  await ensureTemplates()

  return prisma.resumeVersion.create({
    data: {
      resumeId: input.resumeId,
      label: input.label,
      content: JSON.stringify(input.content),
      parentVersionId: input.parentVersionId ?? null,
      templateId: input.templateId ?? DEFAULT_TEMPLATE_ID,
      rawLatexOverride: input.rawLatexOverride ?? null,
    },
  })
}

/**
 * Every version of a résumé, depth-annotated and in lineage order (a parent is
 * always followed by its children). Flat rather than nested because the panel
 * renders one indented list and a nested shape would only be flattened again.
 */
export async function versionTree(resumeId: string): Promise<VersionNode[]> {
  const rows = await prisma.resumeVersion.findMany({
    where: { resumeId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  const childrenOf = new Map<string | null, typeof rows>()
  for (const row of rows) {
    const key = row.parentVersionId
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), row])
  }

  // Orphans (a parent deleted out from under a child) are treated as roots so
  // the tree can never silently lose a version.
  const known = new Set(rows.map((row) => row.id))
  const roots = rows.filter((row) => !row.parentVersionId || !known.has(row.parentVersionId))

  const ordered: VersionNode[] = []
  const walk = (row: (typeof rows)[number], depth: number) => {
    ordered.push({ ...row, depth })
    for (const child of childrenOf.get(row.id) ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)

  return ordered
}

export async function getVersion(versionId: string) {
  return prisma.resumeVersion.findUnique({ where: { id: versionId } })
}

/** Parses a stored version's JSON back into content. Throws if the row is corrupt. */
export function versionContent(version: { content: string }): ResumeContent {
  return parseResumeContent(JSON.parse(version.content))
}

export async function listResumes() {
  return prisma.resume.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { versions: { orderBy: { createdAt: 'asc' } } },
  })
}

export async function getResume(resumeId: string) {
  return prisma.resume.findUnique({
    where: { id: resumeId },
    include: { versions: { orderBy: { createdAt: 'asc' } } },
  })
}

/**
 * Autosave target for the editor: rewrites the *working* version in place.
 * Named versions are created with `saveVersion` and never touched again — this
 * only ever moves the version the user is actively editing.
 */
export async function updateVersionContent(
  versionId: string,
  content: ResumeContent,
  options: { templateId?: string | null; rawLatexOverride?: string | null } = {},
) {
  const version = await prisma.resumeVersion.update({
    where: { id: versionId },
    data: {
      content: JSON.stringify(content),
      ...(options.templateId !== undefined ? { templateId: options.templateId } : {}),
      ...(options.rawLatexOverride !== undefined
        ? { rawLatexOverride: options.rawLatexOverride }
        : {}),
    },
  })

  await prisma.resume.update({ where: { id: version.resumeId }, data: { updatedAt: new Date() } })
  return version
}
