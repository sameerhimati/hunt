import { describe, expect, it } from 'vitest'

import { dateRange, humanDate, tex } from '@/lib/resume/latex'

describe('humanDate', () => {
  it('turns the stored ISO month into what a résumé actually says', () => {
    expect(humanDate('2026-01')).toBe('Jan 2026')
    expect(humanDate('2018-08')).toBe('Aug 2018')
    expect(humanDate('2021-12')).toBe('Dec 2021')
  })

  it('leaves anything it cannot confidently parse exactly as written', () => {
    // Résumé dates are free text; inventing a format for these would be worse
    // than echoing the user.
    for (const value of ['2015', 'Summer 2019', 'Present', '', '2020-13', '2020-00']) {
      expect(humanDate(value)).toBe(value)
    }
  })
})

describe('dateRange', () => {
  it('humanises both ends and calls a missing end Present', () => {
    expect(dateRange('2022-01', null)).toBe('Jan 2022 -- Present')
    expect(dateRange('2018-08', '2021-12')).toBe('Aug 2018 -- Dec 2021')
  })

  it('is empty when the entry carries no dates at all', () => {
    expect(dateRange(null, null)).toBe('')
  })
})

describe('tex escaping', () => {
  it('escapes the characters a real résumé is full of', () => {
    // One unescaped $ turns the rest of the document into math mode.
    expect(tex('$40M/month')).toBe('\\$40M/month')
    expect(tex('100% uptime')).toBe('100\\% uptime')
    expect(tex('A&R, C#')).toBe('A\\&R, C\\#')
  })
})
