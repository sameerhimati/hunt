import { describe, expect, it } from 'vitest'

import {
  emptyResume,
  parseResumeContent,
  resolvePath,
  safeParseResumeContent,
} from '@/lib/resume/schema'

describe('parseResumeContent', () => {
  it('drops unknown keys instead of carrying them into the document', () => {
    const content = parseResumeContent({
      _comment: 'fixture provenance',
      basics: { name: 'Alex Chen', nickname: 'AC' },
      experience: [{ company: 'Ramp', title: 'SWE', bullets: ['Shipped'], salary: '$200k' }],
    })

    expect(content).not.toHaveProperty('_comment')
    expect(content.basics).not.toHaveProperty('nickname')
    expect(content.experience[0]).not.toHaveProperty('salary')
  })

  it('trims text and collapses blanks so diffs stay quiet', () => {
    const content = parseResumeContent({
      basics: { name: '  Alex Chen  ', label: '   ', email: null },
    })

    expect(content.basics.name).toBe('Alex Chen')
    expect(content.basics.label).toBeUndefined()
    expect(content.basics.email).toBeUndefined()
  })

  it('refuses anything that is not a résumé', () => {
    expect(() => parseResumeContent({ basics: 42 })).toThrow()
    expect(() => parseResumeContent('not json')).toThrow()
    expect(safeParseResumeContent({ basics: { name: 'A' } }).success).toBe(true)
  })

  it('starts a blank document with the name already on it', () => {
    const blank = emptyResume('Alex Chen')
    expect(blank.basics.name).toBe('Alex Chen')
    expect(blank.experience).toEqual([])
  })
})

describe('resolvePath (the citation language)', () => {
  const content = parseResumeContent({
    basics: { name: 'Alex Chen' },
    experience: [{ company: 'Ramp', title: 'SWE', bullets: ['first', 'second'] }],
  })

  it('resolves an indexed path', () => {
    expect(resolvePath(content, 'experience[0].bullets[1]')).toBe('second')
    expect(resolvePath(content, 'basics.name')).toBe('Alex Chen')
  })

  it('returns undefined rather than throwing on a path that does not exist', () => {
    expect(resolvePath(content, 'experience[9].bullets[0]')).toBeUndefined()
    expect(resolvePath(content, 'nonsense.path')).toBeUndefined()
  })
})
