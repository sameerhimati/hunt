import fs from 'node:fs'
import path from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { ResumeImportError } from '@/lib/resume/import'
import { readDocx } from '@/lib/resume/parse/docx'

/**
 * Most fixtures here are built in-process, because the interesting cases are
 * single OOXML features (`w:sz` present vs absent, `w:ind`, `w:numPr`) and a
 * committed binary would hide the one line of XML each test is actually about.
 *
 * The exception is `pandoc-resume.docx`, a real file from a real generator. A
 * hand-written fixture only ever proves the parser reads what *we* think Word
 * writes; that one proves it survives what a toolchain actually emits —
 * deflated entries, pretty-printed whitespace between elements, `bookmarkStart`
 * siblings, styles instead of run sizes, and a trailing `w:sectPr`.
 */
const PANDOC_DOCX = path.resolve(process.cwd(), 'gates/fixtures/resume/pandoc-resume.docx')

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

/** Wraps a body fragment in the namespace declaration Word always writes. */
function documentXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${body}
</w:body></w:document>`
}

interface ZipEntry {
  name: string
  data: Buffer
  /** Stored rather than deflated — both are legal in a .docx, so both are read. */
  stored?: boolean
}

/**
 * A minimal zip writer, so a test can describe a .docx as XML.
 *
 * Kept honest about the format on purpose: real central-directory records with
 * real CRCs, because the reader trusts the central directory for sizes and a
 * fake one would test nothing.
 */
function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const body = entry.stored ? entry.data : deflateRawSync(entry.data)
    const checksum = crc32(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.stored ? 0 : 8, 8)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(entry.stored ? 0 : 8, 10)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += 30 + name.length + body.length
  }

  const directory = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(offset, 16)

  return Buffer.concat([Buffer.concat(locals), directory, eocd])
}

/** A .docx carrying the given body fragment and nothing else that matters. */
function docx(body: string, options: { stored?: boolean } = {}): Buffer {
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    {
      name: 'word/document.xml',
      data: Buffer.from(documentXml(body), 'utf8'),
      stored: options.stored,
    },
  ])
}

const para = (text: string, pPr = '') =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

const style = (id: string) => `<w:pStyle w:val="${id}"/>`

describe('readDocx', () => {
  it('reads a whole résumé in document order', async () => {
    const source = await readDocx(
      docx(
        [
          para('Dana Reyes', style('Title')),
          para('Platform Engineer — dana@example.com'),
          para('Experience', style('Heading1')),
          para('Northwind', style('Heading2')),
          para('Ran the build system for 60 services', `${style('ListParagraph')}<w:numPr/>`),
        ].join('\n'),
      ),
    )

    expect(source.kind).toBe('docx')
    expect(source.lines.map((line) => line.text)).toEqual([
      'Dana Reyes',
      'Platform Engineer — dana@example.com',
      'Experience',
      'Northwind',
      'Ran the build system for 60 services',
    ])
    // `y` only has to sort, and document order is the true order.
    expect(source.lines.map((line) => line.y)).toEqual([0, 1, 2, 3, 4])
    // The haystack `scoreConfidence()` checks fields against.
    expect(source.text).toContain('Platform Engineer — dana@example.com')
    expect(source.text.split('\n')).toHaveLength(5)
  })

  it('synthesises font sizes from heading styles so hierarchy survives', async () => {
    const source = await readDocx(
      docx(
        [
          para('Dana Reyes', style('Title')),
          para('Experience', style('Heading1')),
          para('Northwind', style('Heading 2')),
          // LibreOffice escapes the space in a style id rather than dropping it.
          para('Platform Engineer', style('Heading_20_3')),
          para('Ran the build system'),
        ].join('\n'),
      ),
    )

    expect(source.lines.map((line) => line.fontSize)).toEqual([24, 18, 14, 12, 11])
  })

  it('prefers a real w:sz over the style it would have synthesised', async () => {
    const source = await readDocx(
      docx(
        `<w:p><w:pPr>${style('Heading1')}</w:pPr>` +
          '<w:r><w:rPr><w:sz w:val="52"/><w:rFonts w:ascii="Georgia"/></w:rPr><w:t>Dana Reyes</w:t></w:r>' +
          '</w:p>',
      ),
    )

    expect(source.lines[0]).toMatchObject({ fontSize: 26, fontName: 'Georgia' })
  })

  it('marks bold with a distinguishable font id, since that is how a title reads', async () => {
    const source = await readDocx(
      docx(
        '<w:p><w:r><w:rPr><w:b/><w:rFonts w:ascii="Calibri"/></w:rPr><w:t>Northwind</w:t></w:r></w:p>' +
          '<w:p><w:r><w:rPr><w:b w:val="0"/><w:rFonts w:ascii="Calibri"/></w:rPr><w:t>2021</w:t></w:r></w:p>' +
          para('Platform Engineer', style('Heading2')),
      ),
    )

    expect(source.lines.map((line) => line.fontName)).toEqual([
      'Calibri-bold',
      'Calibri',
      // No run font: the style id stands in, which is what makes a heading
      // typographically distinct from body text without inventing a measurement.
      'Heading2',
    ])
  })

  it('records real list items and typed bullets identically', async () => {
    const source = await readDocx(
      docx(
        [
          para('Ran the build system', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>'),
          para('• Cut deploy time to 6 min'),
          para('- Owned the on-call rotation'),
          para('Platform Engineer'),
          // A leading dash that is not a bullet, because nothing follows it.
          para('-5% churn after the migration'),
        ].join('\n'),
      ),
    )

    expect(source.lines.map((line) => [line.text, line.isListItem])).toEqual([
      ['Ran the build system', true],
      // The glyph is stripped and the fact moves into the boolean, so a typed
      // bullet and a real one are indistinguishable downstream.
      ['Cut deploy time to 6 min', true],
      ['Owned the on-call rotation', true],
      ['Platform Engineer', false],
      ['-5% churn after the migration', false],
    ])
    expect(source.text).not.toContain('•')
  })

  it('reads indentation from w:ind, in points', async () => {
    const source = await readDocx(
      docx(
        [
          para('Experience', style('Heading1')),
          // 720 twips = half an inch. `w:hanging` moves the glyph, not the text,
          // so `x` is the text edge — which is what makes a wrapped
          // continuation share its bullet's `x`.
          para('Ran the build system', '<w:ind w:left="720" w:hanging="360"/><w:numPr/>'),
          para('Nested detail', '<w:ind w:start="1440"/>'),
        ].join('\n'),
      ),
    )

    expect(source.lines.map((line) => line.x)).toEqual([0, 36, 72])
  })

  it('reports the same right edge on every line, because DOCX has no width', async () => {
    const source = await readDocx(
      docx([para('Dana Reyes', style('Title')), para('A much, much longer line')].join('\n')),
    )

    const [first, second] = source.lines
    expect(first.right).toBe(second.right)
  })

  it('splits a paragraph at w:br and joins runs without losing the spaces between them', async () => {
    const source = await readDocx(
      docx(
        '<w:p><w:r><w:t xml:space="preserve">Senior </w:t></w:r>' +
          '<w:r><w:t>Platform Engineer</w:t></w:r>' +
          '<w:r><w:br/><w:t>dana@example.com</w:t><w:tab/><w:t>Chicago</w:t></w:r></w:p>',
      ),
    )

    expect(source.lines.map((line) => line.text)).toEqual([
      'Senior Platform Engineer',
      'dana@example.com\tChicago',
    ])
  })

  it('keeps hyperlinked text in place and drops text the reader cannot see', async () => {
    const source = await readDocx(
      docx(
        '<w:p><w:r><w:t xml:space="preserve">Email </w:t></w:r>' +
          '<w:hyperlink r:id="rId4"><w:r><w:t>dana@example.com</w:t></w:r></w:hyperlink>' +
          '<w:r><w:instrText> PAGE </w:instrText></w:r>' +
          '<w:del><w:r><w:delText>old@example.com</w:delText></w:r></w:del></w:p>',
      ),
    )

    expect(source.lines[0].text).toBe('Email dana@example.com')
  })

  it('advances page on a real section break and leaves it at 0 otherwise', async () => {
    const source = await readDocx(
      docx(
        [
          para('Page one'),
          para('Last line of section one', '<w:sectPr/>'),
          para('Page two'),
        ].join('\n'),
      ),
    )

    expect(source.lines.map((line) => line.page)).toEqual([0, 0, 1])
  })

  it('finds text inside tables, which is where a sidebar layout hides', async () => {
    const source = await readDocx(
      docx(
        '<w:tbl><w:tr>' +
          `<w:tc>${para('Skills', style('Heading2'))}${para('Go, TypeScript')}</w:tc>` +
          `<w:tc>${para('Experience', style('Heading2'))}</w:tc>` +
          '</w:tr></w:tbl>',
      ),
    )

    // Row-major, so a two-column table interleaves. Documented limitation, not
    // a silent one: `right` is constant, so nothing can un-interleave it.
    expect(source.lines.map((line) => line.text)).toEqual([
      'Skills',
      'Go, TypeScript',
      'Experience',
    ])
  })

  it('returns what it found in a sparse document instead of calling it an error', async () => {
    const empty = await readDocx(docx('<w:p/><w:p><w:r><w:t>   </w:t></w:r></w:p>'))
    expect(empty).toEqual({ kind: 'docx', lines: [], text: '' })

    const oneLine = await readDocx(docx(para('Dana Reyes')))
    expect(oneLine.lines).toHaveLength(1)
  })

  it('reads a stored (uncompressed) entry as well as a deflated one', async () => {
    const source = await readDocx(docx(para('Dana Reyes', style('Title')), { stored: true }))
    expect(source.lines[0]).toMatchObject({ text: 'Dana Reyes', fontSize: 24 })
  })

  it('reads a real generator’s file, not just our idea of one', async () => {
    const source = await readDocx(fs.readFileSync(PANDOC_DOCX))

    expect(source.lines[0]).toMatchObject({
      text: 'Dana Reyes',
      fontSize: 18, // pandoc maps a level-1 markdown heading to Heading1.
      page: 0,
      x: 0,
    })
    expect(source.text).toContain('Platform Engineer — dana@example.com — +1 415 555 0000')

    const bullets = source.lines.filter((line) => line.isListItem)
    expect(bullets.map((line) => line.text)).toEqual([
      'Ran the build system for 60 services',
      'Cut p95 deploy time from 22 min to 6 min',
    ])

    // Sections: pandoc's trailing `w:sectPr` is a sibling of the paragraphs, not
    // a break inside one, so a single-section document stays on page 0.
    expect(new Set(source.lines.map((line) => line.page))).toEqual(new Set([0]))
  })
})

describe('readDocx refusals', () => {
  it('names the legacy .doc format instead of reporting a broken file', async () => {
    const ole = Buffer.alloc(512)
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

    await expect(readDocx(ole)).rejects.toThrow(ResumeImportError)
    await expect(readDocx(ole)).rejects.toThrow(/legacy Word \.doc/i)
  })

  it('refuses anything that is not a zip', async () => {
    await expect(readDocx(Buffer.from('not a docx'))).rejects.toThrow(/could not be read as a DOCX/i)
    await expect(readDocx(Buffer.alloc(0))).rejects.toThrow(ResumeImportError)
  })

  it('refuses a truncated zip rather than reading past the end of it', async () => {
    const whole = docx(para('Dana Reyes'))

    // Truncating the payload leaves a findable EOCD pointing at bytes that are
    // no longer there — the failure mode a naive reader turns into garbage.
    const truncated = Buffer.concat([whole.subarray(0, 60), whole.subarray(whole.length - 22)])
    await expect(readDocx(truncated)).rejects.toThrow(ResumeImportError)

    // Corrupt the deflate stream but leave every header intact: the first
    // occurrence of the entry name is its local header, and the payload starts
    // right after it. 0xff opens a reserved block type, so inflate must refuse.
    const corrupted = Buffer.from(whole)
    const payload = whole.indexOf('word/document.xml') + 'word/document.xml'.length
    corrupted.fill(0xff, payload, payload + 8)
    await expect(readDocx(corrupted)).rejects.toThrow(ResumeImportError)
  })

  it('refuses a zip that is not a Word document, and says so', async () => {
    const notWord = zip([{ name: 'hello.txt', data: Buffer.from('hi', 'utf8') }])
    await expect(readDocx(notWord)).rejects.toThrow(/not a Word document/i)
  })
})
