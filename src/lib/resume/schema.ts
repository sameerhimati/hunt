import { z } from 'zod'

/**
 * ResumeContent — the structured document hunt edits, renders, diffs and
 * tailors. A superset of JSON Resume, trimmed to what the editor actually
 * shows and pinned by `gates/fixtures/resume/alex-chen.json`.
 *
 * Two properties everything else leans on:
 *  - **Paths are stable and addressable.** `experience[0].bullets[3]` is the
 *    citation language of the whole product (TAILORING-DIFF.md), so the shape
 *    is arrays of records, never maps keyed by generated ids.
 *  - **Unknown keys are dropped, not carried.** Zod object parsing strips them,
 *    which is what lets us feed a model's JSON straight through this schema and
 *    know the result is exactly the document we can render.
 */

const trimmed = z.string().trim()

/** Optional free text. Empty strings collapse to undefined so diffs stay quiet. */
const optionalText = trimmed
  .optional()
  .nullable()
  .transform((value) => (value ? value : undefined))

export const basicsSchema = z.object({
  name: trimmed.default(''),
  /** The headline under the name — "Backend Engineer". */
  label: optionalText,
  email: optionalText,
  phone: optionalText,
  url: optionalText,
  location: optionalText,
  summary: optionalText,
})

export const experienceSchema = z.object({
  company: trimmed.default(''),
  title: trimmed.default(''),
  location: optionalText,
  /** `YYYY-MM` (or `YYYY`). Kept as text — résumés say "2023-03", not a Date. */
  start: optionalText,
  /** Absent/null means "present". */
  end: optionalText,
  bullets: z.array(trimmed).default([]),
})

export const educationSchema = z.object({
  institution: trimmed.default(''),
  degree: optionalText,
  location: optionalText,
  start: optionalText,
  end: optionalText,
  bullets: z.array(trimmed).default([]),
})

export const skillGroupSchema = z.object({
  category: trimmed.default(''),
  items: z.array(trimmed).default([]),
})

export const projectSchema = z.object({
  name: trimmed.default(''),
  description: optionalText,
  url: optionalText,
  bullets: z.array(trimmed).default([]),
})

/** Anything the six built-in sections don't cover — awards, talks, patents. */
export const customSectionSchema = z.object({
  title: trimmed.default(''),
  bullets: z.array(trimmed).default([]),
})

export const resumeContentSchema = z.object({
  basics: basicsSchema,
  experience: z.array(experienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  skills: z.array(skillGroupSchema).default([]),
  projects: z.array(projectSchema).default([]),
  custom: z.array(customSectionSchema).default([]),
})

export type ExperienceEntry = z.infer<typeof experienceSchema>
export type EducationEntry = z.infer<typeof educationSchema>
export type SkillGroup = z.infer<typeof skillGroupSchema>
export type ProjectEntry = z.infer<typeof projectSchema>
export type CustomSection = z.infer<typeof customSectionSchema>
export type ResumeContent = z.infer<typeof resumeContentSchema>

/**
 * The only way content enters the system. Throws on anything that isn't a
 * résumé — a model that returns prose, a truncated import, a hand-edited JSON
 * blob. Callers surface the message; nothing downstream ever sees loose data.
 */
export function parseResumeContent(value: unknown): ResumeContent {
  return resumeContentSchema.parse(value)
}

/** Non-throwing twin for boundaries that want to report rather than fail. */
export function safeParseResumeContent(value: unknown) {
  return resumeContentSchema.safeParse(value)
}

/**
 * Blank entries for the editor's "+ add" affordances.
 *
 * Optional fields parse to an explicit `undefined` rather than a missing key,
 * so these factories exist to keep every construction site honest about the
 * full shape instead of casting.
 */
export function emptyExperience(): ExperienceEntry {
  return parseResumeContent({ basics: { name: '' }, experience: [{}] }).experience[0]
}

export function emptyEducation(): EducationEntry {
  return parseResumeContent({ basics: { name: '' }, education: [{}] }).education[0]
}

export function emptySkillGroup(): SkillGroup {
  return parseResumeContent({ basics: { name: '' }, skills: [{}] }).skills[0]
}

export function emptyProject(): ProjectEntry {
  return parseResumeContent({ basics: { name: '' }, projects: [{}] }).projects[0]
}

export function emptyCustomSection(): CustomSection {
  return parseResumeContent({ basics: { name: '' }, custom: [{}] }).custom[0]
}

/** A blank document — "start from scratch" in the editor's empty state. */
export function emptyResume(name = ''): ResumeContent {
  return parseResumeContent({ basics: { name } })
}

/**
 * Reads a citation path (`experience[0].bullets[3]`) out of content.
 * Returns undefined when the path doesn't resolve — the tailoring validator in
 * Phase 3 depends on that being a fact, not an exception.
 */
export function resolvePath(content: ResumeContent, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)

  let cursor: unknown = content
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}
