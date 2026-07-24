import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Phase 1 exit gate — schema, semantic diff, versioned store.
// RED until src/lib/resume/{schema,diff,store}.ts exist with these contracts.
import { parseResumeContent } from '@/lib/resume/schema'
import { semanticDiff } from '@/lib/resume/diff'
import { createResume, saveVersion, versionTree } from '@/lib/resume/store'

const FIXTURES = process.env.HUNT_FIXTURES_DIR ?? path.resolve(process.cwd(), 'gates/fixtures')
const alexChen = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8'))

describe('resume schema (shape pinned by gates/fixtures/resume/alex-chen.json)', () => {
  it('parses the canonical fixture', () => {
    const content = parseResumeContent(alexChen)
    expect(content.basics.name).toBe('Alex Chen')
    expect(content.experience[0].company).toBe('Ramp')
    // The design docs cite `experience[0].bullets[3]` — that path must resolve here.
    expect(content.experience[0].bullets[3]).toContain('Reduced p99 from 210ms to 130ms')
    expect(content.skills.map((s: { category: string }) => s.category)).toContain('Languages')
  })

  it('rejects garbage instead of passing it through', () => {
    expect(() => parseResumeContent({ basics: 42 })).toThrow()
  })
})

describe('semantic diff', () => {
  it('is empty for identical content', () => {
    const content = parseResumeContent(alexChen)
    expect(semanticDiff(content, content)).toEqual([])
  })

  it('reports an edit with its path, was and now', () => {
    const base = parseResumeContent(alexChen)
    const edited = structuredClone(base)
    edited.experience[0].bullets[3] = 'Cut p99 latency 38% by sharding the balance-read path'

    const changes = semanticDiff(base, edited)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      kind: 'edit',
      path: 'experience[0].bullets[3]',
    })
    expect(changes[0].was).toContain('Reduced p99')
    expect(changes[0].now).toContain('Cut p99')
  })

  it('detects reorders as reorders, not remove+add pairs', () => {
    const base = parseResumeContent(alexChen)
    const reordered = structuredClone(base)
    reordered.experience[0].bullets.reverse()

    const kinds = semanticDiff(base, reordered).map((c: { kind: string }) => c.kind)
    expect(kinds).toContain('reorder')
    expect(kinds).not.toContain('remove')
  })
})

describe('versioned store (lineage is the product — Application pins a version)', () => {
  it('tracks base → child lineage', async () => {
    const content = parseResumeContent(alexChen)
    const resume = await createResume('Alex Chen', content)
    const tree = await versionTree(resume.id)
    expect(tree).toHaveLength(1)

    const child = await saveVersion({
      resumeId: resume.id,
      content,
      label: 'Stripe — Senior Backend Engineer',
      parentVersionId: tree[0].id,
    })

    const grown = await versionTree(resume.id)
    expect(grown).toHaveLength(2)
    expect(grown.find((v: { id: string }) => v.id === child.id)?.parentVersionId).toBe(tree[0].id)
  })
})
