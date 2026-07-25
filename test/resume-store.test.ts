import { describe, expect, it } from 'vitest'

import { emptyResume, parseResumeContent } from '@/lib/resume/schema'
import {
  createResume,
  listResumes,
  saveVersion,
  updateVersionContent,
  versionContent,
  versionTree,
} from '@/lib/resume/store'

describe('versioned store', () => {
  it('orders the tree by lineage and annotates depth for the panel', async () => {
    const resume = await createResume('Alex Chen', emptyResume('Alex Chen'))
    const [root] = await versionTree(resume.id)

    const child = await saveVersion({
      resumeId: resume.id,
      content: emptyResume('Alex Chen'),
      label: 'Stripe',
      parentVersionId: root.id,
    })
    const grandchild = await saveVersion({
      resumeId: resume.id,
      content: emptyResume('Alex Chen'),
      label: 'Stripe — v2',
      parentVersionId: child.id,
    })

    const tree = await versionTree(resume.id)
    expect(tree.map((node) => node.id)).toEqual([root.id, child.id, grandchild.id])
    expect(tree.map((node) => node.depth)).toEqual([0, 1, 2])
  })

  it('never rewrites a saved version when a sibling is added', async () => {
    const original = parseResumeContent({ basics: { name: 'Alex Chen' } })
    const resume = await createResume('Alex Chen', original)
    const [root] = await versionTree(resume.id)

    await saveVersion({
      resumeId: resume.id,
      content: parseResumeContent({ basics: { name: 'Alex Chen', label: 'Backend Engineer' } }),
      label: 'sharper headline',
      parentVersionId: root.id,
    })

    const tree = await versionTree(resume.id)
    expect(versionContent(tree[0]).basics.label).toBeUndefined()
    expect(versionContent(tree[1]).basics.label).toBe('Backend Engineer')
  })

  it('overwrites in place only when asked to', async () => {
    const resume = await createResume('Alex Chen', emptyResume('Alex Chen'))
    const [root] = await versionTree(resume.id)

    await updateVersionContent(root.id, parseResumeContent({ basics: { name: 'Alex Chen', email: 'a@example.com' } }))

    const [updated] = await versionTree(resume.id)
    expect(versionContent(updated).basics.email).toBe('a@example.com')
  })

  it('lists résumés with their versions, most recently edited first', async () => {
    await createResume('First', emptyResume('First'))
    await createResume('Second', emptyResume('Second'))

    const resumes = await listResumes()
    expect(resumes[0].name).toBe('Second')
    expect(resumes[0].versions).toHaveLength(1)
  })
})
