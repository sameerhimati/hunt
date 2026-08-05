// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StructuredEditor } from '@/components/resume/structured-editor'
import { emptyResume, type ResumeContent } from '@/lib/resume/schema'

/**
 * Every repeatable entry can be removed and reordered.
 *
 * The gap this covers was asymmetric on purpose-by-accident: four kinds of
 * entry could be added and never removed, so a mis-click wedged a blank group
 * into the résumé with the raw-LaTeX tab as the only way out. Order matters
 * just as much — on a résumé the top bullet of the current role is the line
 * everyone reads — and nothing could be moved at all.
 *
 * Asserted through the rendered controls rather than a helper, because the
 * defect was that the buttons did not exist.
 */

afterEach(cleanup)

function resume(): ResumeContent {
  const content = emptyResume('Sameer Himati')
  content.experience = [
    { ...content.experience[0], company: 'Itamih', title: 'Founder', bullets: ['first', 'second'] },
    { ...content.experience[0], company: 'Fend', title: 'Co-founder', bullets: [] },
  ]
  content.skills = [
    { category: 'Languages', items: ['Python'] },
    { category: 'AI', items: ['Claude'] },
  ]
  content.education = [{ ...content.education[0], institution: 'Toronto' }]
  content.projects = [{ ...content.projects[0], name: 'hunt', bullets: [] }]
  content.custom = [{ title: 'Awards', bullets: [] }]
  return content
}

function renderEditor(content = resume()) {
  const onChange = vi.fn<(next: ResumeContent) => void>()
  render(<StructuredEditor content={content} onChange={onChange} />)
  return onChange
}

describe('removing entries', () => {
  it.each([
    ['role', 'experience'],
    ['school', 'education'],
    ['group', 'skills'],
    ['project', 'projects'],
    ['section', 'custom'],
  ] as const)('a %s can be removed', (noun, key) => {
    const before = resume()
    const onChange = renderEditor(before)

    fireEvent.click(screen.getAllByLabelText(`Remove ${noun}`)[0])

    const next = onChange.mock.calls[0][0]
    expect(next[key]).toHaveLength(before[key].length - 1)
  })

  it('removes a bullet without touching its neighbours', () => {
    const onChange = renderEditor()

    fireEvent.click(screen.getAllByLabelText('Remove bullet')[0])

    expect(onChange.mock.calls[0][0].experience[0].bullets).toEqual(['second'])
  })
})

describe('reordering entries', () => {
  it('moves a role down, and the one below it up', () => {
    const onChange = renderEditor()

    fireEvent.click(screen.getAllByLabelText('Move role down')[0])

    expect(onChange.mock.calls[0][0].experience.map((job) => job.company)).toEqual([
      'Fend',
      'Itamih',
    ])
  })

  it('moves a bullet up', () => {
    const onChange = renderEditor()

    // The second bullet — the first one's "up" is disabled.
    fireEvent.click(screen.getAllByLabelText('Move bullet up')[1])

    expect(onChange.mock.calls[0][0].experience[0].bullets).toEqual(['second', 'first'])
  })

  it('disables the moves that would fall off either end', () => {
    renderEditor()

    const up = screen.getAllByLabelText('Move role up')
    const down = screen.getAllByLabelText('Move role down')

    expect((up[0] as HTMLButtonElement).disabled).toBe(true)
    expect((down[down.length - 1] as HTMLButtonElement).disabled).toBe(true)
    // …and the ones in between are live.
    expect((down[0] as HTMLButtonElement).disabled).toBe(false)
  })

  it('reorders skills, which is what decides the line a reader skims first', () => {
    const onChange = renderEditor()

    fireEvent.click(screen.getAllByLabelText('Move group down')[0])

    expect(onChange.mock.calls[0][0].skills.map((group) => group.category)).toEqual([
      'AI',
      'Languages',
    ])
  })
})
