import { describe, expect, it } from 'vitest'

import { readPosting } from '@/lib/jobs/read-posting'

/**
 * The shapes here are copied from real postings, because the previous parser bug
 * in this repo came from a corpus that agreed with itself. Each block is a
 * different convention, not the same one reworded.
 */
describe('reading a pasted posting', () => {
  it('takes the role from line one and the company from line two', () => {
    expect(
      readPosting(`Software Engineer, Full Stack
Exa
San Francisco, CA

About the role
We are looking for someone to own retrieval end to end.`),
    ).toEqual({ title: 'Software Engineer, Full Stack', company: 'Exa', location: 'San Francisco, CA' })
  })

  it('splits the "<role> at <company>" heading', () => {
    expect(readPosting('Senior AI Engineer, Tools & Agents at Twelve Labs\nRemote')).toEqual({
      title: 'Senior AI Engineer, Tools & Agents',
      company: 'Twelve Labs',
      location: 'Remote',
    })
  })

  it('reads a meta row without mistaking the whole row for a location', () => {
    expect(
      readPosting(`Product Engineer
Firecrawl · San Francisco, CA · Full-time`),
    ).toEqual({ title: 'Product Engineer', company: 'Firecrawl', location: 'San Francisco, CA' })
  })

  it('prefers a labelled field over anything positional', () => {
    expect(
      readPosting(`Careers
Company: PostHog
Role: Context Engineer
Location: Remote (worldwide)

We are a small team.`),
    ).toEqual({ title: 'Context Engineer', company: 'PostHog', location: 'Remote (worldwide)' })
  })

  it('leaves a field null rather than lifting a sentence into it', () => {
    // The line under the role is prose. A wrong company is quoted back in a
    // cover letter, so nothing is better than a guess here.
    const read = readPosting(`Product Engineer, Post Batch

We work with founders after they have raised, and the work changes every week.`)
    expect(read.title).toBe('Product Engineer, Post Batch')
    expect(read.company).toBeNull()
  })

  it('finds nothing in an empty or headless paste, without throwing', () => {
    expect(readPosting('')).toEqual({ title: null, company: null, location: null })
    expect(readPosting('   \n\n  ')).toEqual({ title: null, company: null, location: null })
    expect(
      readPosting(
        'We are hiring! Our team is growing fast and we would love to hear from you soon.',
      ).company,
    ).toBeNull()
  })

  it('does not read salary or employment terms as a location', () => {
    const read = readPosting(`Staff Engineer
Linear
$180,000 - $240,000 · Full-time`)
    expect(read.company).toBe('Linear')
    expect(read.location).toBeNull()
  })

  it('ignores the boilerplate far below the heading', () => {
    // Postings restate the company and list every office in the footer. Reading
    // the whole document would let the last office win over the real one.
    const read = readPosting(
      ['Backend Engineer', 'Ramp', 'New York, NY', ...Array(30).fill('Offices: Remote')].join('\n'),
    )
    expect(read.location).toBe('New York, NY')
  })
})
