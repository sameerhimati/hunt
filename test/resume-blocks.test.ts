import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { readPdf } from '@/lib/resume/parse/blocks'

/**
 * These assert the *signal* the structurer depends on, not exact coordinates.
 *
 * Pinning "the name is at x=206" would break the day someone re-exports a
 * fixture, and it would be testing pdf.js rather than us. What has to hold is
 * the relationship: the name is the largest thing on the page, headings are
 * bigger than body text and sit at the left margin, and a bullet's glyph is
 * remembered without travelling into its text.
 */

const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'gates/fixtures/resume', name))

const SAMPLES = ['sample-1.pdf', 'sample-2.pdf', 'sample-3.pdf'] as const

describe('readPdf', () => {
  it.each(SAMPLES)('%s — the name is the largest line on the first page', async (name) => {
    const doc = await readPdf(fixture(name))

    const firstPage = doc.lines.filter((line) => line.page === 0)
    const biggest = firstPage.reduce((a, b) => (b.fontSize > a.fontSize ? b : a))

    expect(biggest.fontSize).toBeGreaterThan(16)
    // One line, unambiguously — a tie would leave the structurer guessing.
    expect(firstPage.filter((line) => line.fontSize === biggest.fontSize)).toHaveLength(1)
    expect(biggest.text).toMatch(/^[\p{Lu}][\p{L}'’-]+ [\p{Lu}][\p{L}'’-]+$/u)
  })

  it.each(SAMPLES)('%s — headings are typographically distinct from body', async (name) => {
    const doc = await readPdf(fixture(name))

    const heading = doc.lines.find((line) => /^(Experience|Skills|Education)$/.test(line.text))
    expect(heading, 'a section heading should survive as its own line').toBeDefined()

    // Not "bigger": sample 3's headings are the same 9.96pt as its body text and
    // are set bold instead. Size alone would miss every heading in that
    // template, which is why the contract carries `fontName` at all — the
    // invariant is that a heading differs from body somehow, not that it is
    // larger.
    const body = doc.lines
      .filter((line) => line.isListItem)
      .reduce<{ size: number; font: string } | null>(
        (found, line) => found ?? { size: line.fontSize, font: line.fontName },
        null,
      )
    expect(body, 'a résumé fixture should have at least one bullet').not.toBeNull()
    expect(
      heading!.fontSize > body!.size || heading!.fontName !== body!.font,
      `heading ${heading!.fontSize}/${heading!.fontName} vs body ${body!.size}/${body!.font}`,
    ).toBe(true)
  })

  it('keeps a company and its right-aligned date on one line', async () => {
    const doc = await readPdf(fixture('sample-1.pdf'))

    // Sample 1 sets the employer at the left margin and the date range hard
    // right on the same baseline. Merged plain text loses which date belongs to
    // which employer; this is the layout that recovers it.
    const line = doc.lines.find((entry) => entry.text.startsWith('Convoy'))
    expect(line?.text).toBe('Convoy 2022-01 – Present')
    // Spanning most of the text column is the positional tell that the date is
    // right-aligned against the employer rather than following it in prose.
    expect(line!.right - line!.x).toBeGreaterThan(300)
  })

  it('strips the bullet glyph but remembers it', async () => {
    const doc = await readPdf(fixture('sample-1.pdf'))

    const bullets = doc.lines.filter((line) => line.isListItem)
    expect(bullets.length).toBeGreaterThanOrEqual(5)
    for (const bullet of bullets) {
      expect(bullet.text).not.toMatch(/^[•‣▪●◦⁃∙*·]/)
      expect(bullet.text.length).toBeGreaterThan(3)
    }
    expect(bullets[0].text).toContain('Rebuilt the freight pricing feature store')
  })

  it('reassembles words pdf.js split mid-token', async () => {
    const doc = await readPdf(fixture('sample-3.pdf'))

    // The verbatim check downstream is a plain substring test, so a stray space
    // inside "TypeScript" is not cosmetic — it makes the field unverifiable.
    expect(doc.text).toContain('TypeScript')
    expect(doc.text).not.toMatch(/Type\s+Script/)
  })

  it('orders lines down the page, not up it', async () => {
    const doc = await readPdf(fixture('sample-1.pdf'))

    const ys = doc.lines.filter((line) => line.page === 0).map((line) => line.y)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))

    // The name is at the top, so it must carry the smallest y of the page.
    const name = doc.lines.find((line) => line.text === 'Priya Raghavan')
    expect(name!.y).toBe(Math.min(...ys))
  })

  it('splits a two-column page instead of welding the columns together', async () => {
    const doc = await readPdf(fixture('sample-3.pdf'))
    const texts = doc.lines.map((line) => line.text)

    // Sample 3 is a sidebar layout, so "Education" (left) and "Experience"
    // (right) share a baseline. Grouping on baseline alone produced the line
    // "Education Experience" and corrupted every field under both.
    expect(texts).toContain('Education')
    expect(texts).toContain('Experience')
    expect(texts.some((text) => /Education\s+Experience/.test(text))).toBe(false)
    expect(texts.some((text) => /^2014 – 2018 /.test(text))).toBe(false)

    // Whole sidebar, then the main column — the order a person reads it in.
    expect(texts.indexOf('Speaking')).toBeLessThan(texts.indexOf('Experience'))
  })

  it('measures a bullet from its text, not its hanging glyph', async () => {
    const doc = await readPdf(fixture('sample-3.pdf'))

    // The continuation is how a wrapped bullet is recognised downstream, and it
    // is recognised by indent — so the bullet and its continuation have to agree.
    const bullet = doc.lines.find((line) => line.text.startsWith('React Chicago 2024'))
    const continuation = doc.lines.find(
      (line) => line.text === 'checkout without breaking checkout',
    )

    expect(bullet?.isListItem).toBe(true)
    expect(continuation?.isListItem).toBe(false)
    expect(Math.abs(bullet!.x - continuation!.x)).toBeLessThan(2)
  })

  it('exposes text every extracted line can be found in', async () => {
    const doc = await readPdf(fixture('sample-2.pdf'))

    // `text` is the haystack scoreConfidence() checks fields against; a line
    // missing from it is a field the review screen would flag as unverifiable.
    for (const line of doc.lines) {
      if (/[a-z]-$/.test(line.text)) continue // dehyphenated in `text` by design
      expect(doc.text).toContain(line.text)
    }
  })
})
