import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { countPages } from '@/lib/resume/render'

/**
 * Reading the page count back off a compiled document.
 *
 * The count closes a specific hole: tailoring only ever adds text, and nothing
 * looked at what that did to the page break. So the property that matters is
 * that the number is **right or absent** — a confidently wrong count is worse
 * than none, because the user can see the document and we cannot.
 *
 * These run against the committed sample PDFs rather than hand-built byte
 * strings, and that is the point. The first implementation counted `/Type
 * /Page` occurrences and passed a suite of invented buffers while returning
 * zero on every real document, because the renderer writes compressed object
 * streams and there is no such literal in the file. A test that cannot see that
 * is testing its own fiction.
 */
const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures/resume')

function sample(n: number): Buffer {
  return fs.readFileSync(path.join(FIXTURES, `sample-${n}.pdf`))
}

describe('countPages', () => {
  it.each([1, 2, 3])('reads sample-%i.pdf as a real document', async (n) => {
    expect(await countPages(sample(n))).toBeGreaterThan(0)
  })

  it('agrees with the page count the parser sees in the same file', async () => {
    // `readPdf` walks pages independently, so this cross-checks the number
    // against a second reader rather than against a constant we chose.
    const { readPdf } = await import('@/lib/resume/parse/blocks')
    const doc = await readPdf(sample(1))
    const pagesSeen = new Set(doc.lines.map((line) => line.page)).size

    expect(await countPages(sample(1))).toBe(pagesSeen)
  })

  /**
   * Zero is the "could not tell" signal the UI keys off to render nothing. It
   * has to be reachable on something unreadable, and — the failure that
   * actually happened — unreachable on a document that does have pages.
   */
  it('reports zero rather than guessing when the bytes are not a PDF', async () => {
    expect(await countPages(Buffer.from('not a pdf at all'))).toBe(0)
  })

  it('reports zero on an empty buffer instead of throwing', async () => {
    expect(await countPages(Buffer.from(''))).toBe(0)
  })
})
