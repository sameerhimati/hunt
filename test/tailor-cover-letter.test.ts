// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CoverLetterTab,
  retainedFraction,
  type CoverLetterActions,
} from '@/components/tailor/cover-letter-tab'
import { FakeLlmProvider } from '@/lib/llm'
import { promptKindOf } from '@/lib/llm/prompts'
import { parseResumeContent } from '@/lib/resume/schema'
import {
  CoverLetterResponseError,
  CoverLetterUnavailableError,
  draftCoverLetter,
  parseCoverLetterDraft,
  resolveCoverLetterCitation,
  type CoverLetterDraft,
} from '@/lib/tailor/cover-letter'
import {
  coverLetterPath,
  fromMarkdown,
  loadCoverLetter,
  saveCoverLetter,
  toMarkdown,
} from '@/lib/tailor/cover-letter-store'

/**
 * The cover letter is generative, so nothing here checks that hunt refused to
 * write something. What it checks is the guard that replaces refusal: every
 * paragraph is kept, and the ones hunt cannot trace back into the user's own
 * documents say so, by name, before the letter is sent (TAILORING-DIFF §6).
 */

// Vitest runs without globals, so RTL's auto-cleanup never registers itself.
afterEach(cleanup)

const FIXTURES = path.resolve(process.cwd(), 'gates/fixtures')

const content = parseResumeContent(
  JSON.parse(fs.readFileSync(path.join(FIXTURES, 'resume/alex-chen.json'), 'utf8')),
)

const job = {
  title: 'Senior Backend Engineer',
  company: 'Stripe',
  jdText: 'Own the charge path. Go, Kafka, ledgers. On-call and incident response.',
}

/** The committed script for `kind:cover_letter` — the shape the drafter must parse. */
const scripted = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'llm/cover-letter-stripe.json'), 'utf8'),
).response as unknown

function llmReturning(payload: unknown) {
  return new FakeLlmProvider({
    responder: () => (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  })
}

function parse(raw: unknown): CoverLetterDraft {
  return parseCoverLetterDraft(raw, { applicationId: 'app1', content, job })
}

describe('the cover letter prompt', () => {
  it('goes out tagged kind:cover_letter with the résumé and posting in the cached prefix', async () => {
    const llm = llmReturning(scripted)
    await draftCoverLetter({ applicationId: 'app1', content, job, llm })

    const request = llm.requests[0]
    expect(promptKindOf(request)).toBe('cover_letter')

    const cached = (request.system ?? []).filter((block) => block.cache)
    expect(cached.length).toBeGreaterThan(0)

    const prefix = cached.map((block) => block.text).join('\n')
    expect(prefix).toContain(job.jdText)
    expect(prefix).toContain(content.basics.name)
    // The per-call turn carries no content, or the prefix stops being the payload.
    expect(request.messages.map((message) => message.content).join('').length).toBeLessThan(120)
  })

  it('sends a byte-identical prefix on a regenerate, so the provider cache hits', async () => {
    const llm = llmReturning(scripted)
    await draftCoverLetter({ applicationId: 'app1', content, job, llm })
    await draftCoverLetter({ applicationId: 'app1', content, job, llm })

    const prefixes = llm.requests.map((request) =>
      (request.system ?? [])
        .filter((block) => block.cache)
        .map((block) => block.text)
        .join('\n'),
    )

    expect(prefixes).toHaveLength(2)
    expect(prefixes[0]).toBe(prefixes[1])
  })
})

describe('drafting under the citation guard', () => {
  it('parses the committed fixture into paragraphs with resolved sources', async () => {
    const draft = await draftCoverLetter({
      applicationId: 'app1',
      content,
      job,
      llm: llmReturning(scripted),
    })

    expect(draft.paragraphs).toHaveLength(3)
    expect(draft.savedAt).toBeNull()

    const [opening] = draft.paragraphs
    expect(opening.citations.map((citation) => citation.path)).toEqual([
      'basics.summary',
      'experience[0].bullets[0]',
    ])
    expect(opening.citations[0].source).toBe('resume')
    // The snippet is the text really at that path — the hover affordance's fact.
    expect(opening.citations[0].snippet).toBe(content.basics.summary)
    expect(opening.flag).toBeUndefined()
  })

  it('flags the uncited claim inline and keeps it in the letter, in order', async () => {
    const draft = await draftCoverLetter({
      applicationId: 'app1',
      content,
      job,
      llm: llmReturning(scripted),
    })

    const flagged = draft.paragraphs[1]
    expect(flagged.text).toContain('hired and led a team of eight engineers')
    expect(flagged.flag).toMatch(/no source/i)
    expect(flagged.citations).toEqual([])

    // Never silently dropped: the paragraph after it is still the third one.
    expect(draft.paragraphs.filter((paragraph) => paragraph.flag)).toHaveLength(1)
    expect(draft.paragraphs[2].citations).toHaveLength(1)
  })

  it('treats a citation that does not resolve as no citation, and names it', () => {
    const draft = parse({
      paragraphs: [
        {
          text: 'I rebuilt the fraud model that saved $12M a year.',
          citations: ['experience[9].bullets[0]', 'basics.nickname'],
        },
      ],
    })

    const [paragraph] = draft.paragraphs
    expect(paragraph.citations).toEqual([])
    expect(paragraph.flag).toContain('experience[9].bullets[0]')
    expect(paragraph.flag).toContain('basics.nickname')
    expect(paragraph.text).toContain('fraud model')
  })

  it('keeps a paragraph whose sources partly resolve, citing only the real ones', () => {
    const [paragraph] = parse({
      paragraphs: [
        {
          text: 'Six years of payments work in Go.',
          citations: ['basics.summary', 'experience[42].title'],
        },
      ],
    }).paragraphs

    expect(paragraph.citations.map((citation) => citation.path)).toEqual(['basics.summary'])
    expect(paragraph.flag).toBeUndefined()
  })

  it('accepts the posting as a source, but only its real fields', () => {
    expect(
      resolveCoverLetterCitation('job.jdText', content, job, 'I own the charge path in Go.'),
    ).toMatchObject({
      source: 'job',
      snippet: job.jdText,
    })
    expect(resolveCoverLetterCitation('job.salary', content, job, 'anything')).toBeNull()
    expect(
      resolveCoverLetterCitation(
        'experience[0].bullets[0]',
        content,
        job,
        'I own the ledger service that settles $40M a month in card transactions.',
      ),
    ).toMatchObject({ source: 'resume' })
  })

  it('does not let an unrelated field stand as a source for a claim', () => {
    const [paragraph] = parse({
      paragraphs: [
        {
          text: 'I ran the SRE org of forty engineers through two Series-B scale-ups.',
          // A real path, a real value, and nothing to do with the sentence.
          citations: ['basics.name', 'basics.email'],
        },
      ],
    }).paragraphs

    expect(paragraph.citations).toEqual([])
    expect(paragraph.flag).toMatch(/no source/i)
  })

  it('refuses a citation to a whole section — a subtree is not a source', () => {
    expect(
      resolveCoverLetterCitation(
        'experience[0]',
        content,
        job,
        'At Ramp I own the ledger service that settles card transactions across three processors.',
      ),
    ).toBeNull()
  })

  it('accepts a paraphrase that shares the cited field’s substance', () => {
    const [paragraph] = parse({
      paragraphs: [
        {
          text:
            'At Ramp the ledger I own settles about $40M every month in card transactions, ' +
            'spread across three processors.',
          citations: ['experience[0].bullets[0]'],
        },
      ],
    }).paragraphs

    expect(paragraph.citations.map((citation) => citation.path)).toEqual([
      'experience[0].bullets[0]',
    ])
    expect(paragraph.flag).toBeUndefined()
  })

  it('accepts a one-word field when the paragraph actually names it', () => {
    expect(
      resolveCoverLetterCitation(
        'skills[0].items[0]',
        content,
        job,
        'Six of those years were in Go, on services that could not go down.',
      ),
    ).toMatchObject({ source: 'resume' })
  })

  it('skips unreadable entries rather than losing the paragraphs beside them', () => {
    const draft = parse({
      paragraphs: [
        null,
        { text: '   ' },
        { text: 'A real paragraph.', citations: ['basics.summary'] },
      ],
    })

    expect(draft.paragraphs).toHaveLength(1)
    expect(draft.paragraphs[0].origin).toBe('model')
  })

  it('says what went wrong instead of returning an empty letter', async () => {
    await expect(
      draftCoverLetter({ applicationId: 'app1', content, job, llm: llmReturning('no json here') }),
    ).rejects.toBeInstanceOf(CoverLetterResponseError)

    expect(() => parse({ paragraphs: [] })).toThrow(CoverLetterResponseError)
  })

  it('degrades rather than throws a stack trace when no model is configured', async () => {
    await expect(
      draftCoverLetter({ applicationId: 'app1', content, job, llm: null }),
    ).rejects.toBeInstanceOf(CoverLetterUnavailableError)
  })
})

describe('persistence — a markdown file under ./data', () => {
  const draft = (): CoverLetterDraft => ({
    applicationId: 'app-store-1',
    paragraphs: [
      {
        id: 'p1',
        text: 'I own the ledger service that settles $40M a month.',
        citations: [
          { path: 'experience[0].bullets[0]', source: 'resume', snippet: 'settles $40M/month' },
          { path: 'job.jdText', source: 'job', snippet: job.jdText },
        ],
        origin: 'model',
      },
      {
        id: 'p2',
        text: 'I led a team of eight through a replatforming.',
        citations: [],
        origin: 'model',
        flag: 'No source — nothing in your résumé or the posting backs this paragraph.',
      },
      { id: 'p3', text: 'A closing line I wrote myself.', citations: [], origin: 'user' },
    ],
    savedAt: null,
  })

  it('writes one file per application and stamps when it was saved', async () => {
    const saved = await saveCoverLetter('app-store-1', draft())

    const file = coverLetterPath('app-store-1')
    expect(file.endsWith(path.join('cover-letters', 'app-store-1.md'))).toBe(true)
    expect(fs.existsSync(file)).toBe(true)
    expect(saved.savedAt).toBeTruthy()

    const text = fs.readFileSync(file, 'utf8')
    expect(text).toContain('I own the ledger service')
    // Bookkeeping is in comments, so the prose stays a letter.
    expect(text).toContain('<!-- hunt: origin=model cites=experience[0].bullets[0],job.jdText -->')
  })

  it('round-trips paragraphs, origins, citations and the flag', async () => {
    await saveCoverLetter('app-store-1', draft())
    const loaded = await loadCoverLetter('app-store-1')

    expect(loaded?.paragraphs.map((paragraph) => paragraph.origin)).toEqual([
      'model',
      'model',
      'user',
    ])
    expect(loaded?.paragraphs[0].citations.map((citation) => citation.path)).toEqual([
      'experience[0].bullets[0]',
      'job.jdText',
    ])
    expect(loaded?.paragraphs[0].citations[1].source).toBe('job')
    // Recomputed, not remembered: an unsourced model paragraph is still unsourced.
    expect(loaded?.paragraphs[1].flag).toMatch(/no source/i)
    // The user's own closing line is never flagged.
    expect(loaded?.paragraphs[2].flag).toBeUndefined()
    expect(loaded?.savedAt).toBeTruthy()
  })

  it('reads a letter the user hand-edited in their own editor as theirs', () => {
    const loaded = fromMarkdown('A paragraph I typed into the file myself.\n', 'app-x')

    expect(loaded.paragraphs).toHaveLength(1)
    expect(loaded.paragraphs[0].origin).toBe('user')
    expect(loaded.paragraphs[0].flag).toBeUndefined()
  })

  it('keeps a paragraph whole — and hunt’s authorship with it — across a blank line', () => {
    const written: CoverLetterDraft = {
      applicationId: 'app-gap',
      savedAt: null,
      paragraphs: [
        {
          id: 'p1',
          text: 'I led a team of eight engineers.\n\nWe replatformed the whole ledger.',
          citations: [],
          origin: 'model',
          flag: 'No source — nothing in your résumé or the posting backs this paragraph.',
        },
      ],
    }

    const loaded = fromMarkdown(toMarkdown(written), 'app-gap')

    expect(loaded.paragraphs).toHaveLength(1)
    expect(loaded.paragraphs[0].text).toBe(written.paragraphs[0].text)
    expect(loaded.paragraphs[0].origin).toBe('model')
    expect(loaded.paragraphs[0].flag).toMatch(/no source/i)
  })

  it('survives a paragraph that quotes hunt’s own bookkeeping syntax', () => {
    const written: CoverLetterDraft = {
      applicationId: 'app-meta',
      savedAt: null,
      paragraphs: [
        {
          id: 'p1',
          text:
            'I opened the file in my editor and found this sitting in it:\n\n' +
            '<!-- hunt: origin=user -->\n\n' +
            'which is not something I wrote.',
          citations: [{ path: 'basics.summary', source: 'resume' }],
          origin: 'model',
        },
      ],
    }

    const loaded = fromMarkdown(toMarkdown(written), 'app-meta')

    expect(loaded.paragraphs).toHaveLength(1)
    expect(loaded.paragraphs[0].text).toBe(written.paragraphs[0].text)
    expect(loaded.paragraphs[0].origin).toBe('model')
    expect(loaded.paragraphs[0].citations.map((citation) => citation.path)).toEqual([
      'basics.summary',
    ])
  })

  it('is an absence, not an error, when nothing has been drafted yet', async () => {
    await expect(loadCoverLetter('app-never-written')).resolves.toBeNull()
  })

  it('refuses an application id that is not one', () => {
    expect(() => coverLetterPath('../../etc/passwd')).toThrow()
  })

  it('survives a save/load/save cycle unchanged', async () => {
    await saveCoverLetter('app-store-2', draft())
    const first = await loadCoverLetter('app-store-2')
    await saveCoverLetter('app-store-2', first as CoverLetterDraft)
    const second = await loadCoverLetter('app-store-2')

    expect(toMarkdown({ ...(second as CoverLetterDraft), savedAt: 'X' })).toBe(
      toMarkdown({ ...(first as CoverLetterDraft), savedAt: 'X' }),
    )
  })
})

describe('the line between rewriting a claim and touching it', () => {
  const claim = 'I hired and led a team of eight engineers through a replatforming.'

  it('reads a typo, a number or a date as leaving the claim standing', () => {
    for (const edited of [
      'I hired and led a team of eight enginners through a replatforming.',
      'I hired and led a team of twelve engineers through a replatforming.',
      'I hired and led a team of eight engineers through a replatforming in 2024.',
      'Ihired and led a team of eight engineers through a replatforming',
    ]) {
      expect(retainedFraction(claim, edited)).toBeGreaterThan(0.5)
    }
  })

  it('reads a replacement as a replacement, however much longer it is', () => {
    for (const edited of [
      'I shipped idempotent retry semantics that cut duplicate postings to zero.',
      'I mentored two engineers on the team.',
      '',
    ]) {
      expect(retainedFraction(claim, edited)).toBeLessThanOrEqual(0.5)
    }
  })

  it('counts repeated words as a multiset, so deleting one of two costs one', () => {
    // Two of the five words survive; a set-based count would score this 2/3.
    expect(retainedFraction('a team beside a team', 'a team')).toBe(0.4)
  })
})

describe('the cover letter tab', () => {
  const savedDraft: CoverLetterDraft = {
    applicationId: 'app1',
    savedAt: '2026-07-25T10:00:00.000Z',
    paragraphs: [
      {
        id: 'p1',
        text: 'I own the ledger service that settles $40M a month.',
        citations: [
          { path: 'experience[0].bullets[0]', source: 'resume', snippet: 'settles $40M/month' },
        ],
        origin: 'model',
      },
      {
        id: 'p2',
        text: 'I led a team of eight engineers.',
        citations: [],
        origin: 'model',
        flag: 'No source — nothing in your résumé or the posting backs this paragraph.',
      },
    ],
  }

  function mount(actions: Partial<CoverLetterActions> = {}, hasLlm = true) {
    const stub: CoverLetterActions = {
      load: vi.fn(async () => ({ ok: true as const, draft: savedDraft })),
      draft: vi.fn(async () => ({ ok: true as const, draft: savedDraft })),
      save: vi.fn(async (_id: string, next: CoverLetterDraft) => ({
        ok: true as const,
        draft: { ...next, savedAt: '2026-07-25T11:00:00.000Z' },
      })),
      ...actions,
    }

    render(
      createElement(CoverLetterTab, {
        applicationId: 'app1',
        baseVersionId: 'v2',
        job: { title: job.title, company: job.company },
        hasLlm,
        actions: stub,
      }),
    )

    return stub
  }

  it('shows a saved letter without spending a model call on it', async () => {
    const actions = mount()

    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))
    expect(actions.draft).not.toHaveBeenCalled()
    expect(screen.getByTestId('cover-letter-citations').textContent).toContain(
      'experience[0].bullets[0]',
    )
  })

  it('drafts on first open when there is no saved letter', async () => {
    const actions = mount({ load: vi.fn(async () => ({ ok: true as const, draft: null })) })

    await waitFor(() => expect(actions.draft).toHaveBeenCalledTimes(1))
    expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2)
  })

  it('flags the unsourced paragraph inline, and still lets the letter be saved', async () => {
    const actions = mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    const flag = screen.getByTestId('cover-letter-flag')
    expect(flag.textContent).toMatch(/no source/i)
    // No lecture: the copy states the fact and stops.
    expect(flag.textContent).not.toMatch(/dishonest|lie|integrity|honest/i)
    expect(screen.getByTestId('cover-letter-summary').textContent).toContain('1 unsourced')

    const saveButton = screen.getByTestId('save-cover-letter') as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)

    fireEvent.click(saveButton)
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(1))

    const sent = vi.mocked(actions.save).mock.calls[0][1]
    expect(sent.paragraphs).toHaveLength(2)
  })

  it('hands an edited paragraph to the user and drops the flag with hunt’s authorship', async () => {
    const actions = mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    const [, flaggedInput] = screen.getAllByTestId('cover-letter-input')
    fireEvent.change(flaggedInput, { target: { value: 'I mentored two engineers on the team.' } })

    expect(screen.queryByTestId('cover-letter-flag')).toBeNull()

    fireEvent.click(screen.getByTestId('save-cover-letter'))
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(1))

    const sent = vi.mocked(actions.save).mock.calls[0][1]
    expect(sent.paragraphs[1].origin).toBe('user')
    expect(sent.paragraphs[1].flag).toBeUndefined()
    expect(sent.paragraphs[1].text).toBe('I mentored two engineers on the team.')
  })

  it('keeps the mark on a claim the user only touched, and on every future load', async () => {
    const actions = mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    // A typo fix on hunt's unsourced sentence. The claim is untouched, so the
    // flag is: 99% of what hunt wrote is still in the box.
    const [, flaggedInput] = screen.getAllByTestId('cover-letter-input')
    fireEvent.change(flaggedInput, { target: { value: 'I led a team of eight enginners.' } })

    expect(screen.getByTestId('cover-letter-flag').textContent).toMatch(/no source/i)
    expect(screen.getByTestId('cover-letter-summary').textContent).toContain('1 unsourced')

    fireEvent.click(screen.getByTestId('save-cover-letter'))
    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(1))

    // Saved as hunt's, so `fromMarkdown` re-flags it the next time it is opened.
    const sent = vi.mocked(actions.save).mock.calls[0][1]
    expect(sent.paragraphs[1].origin).toBe('model')
    expect(sent.paragraphs[1].flag).toMatch(/no source/i)
    expect(sent.paragraphs[1].text).toBe('I led a team of eight enginners.')
  })

  it('lifts the mark once a rewrite typed one word at a time has replaced the claim', async () => {
    mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    // Measured against what hunt wrote, not against the previous keystroke —
    // otherwise a rewrite made incrementally never crosses any threshold.
    const input = () => screen.getAllByTestId('cover-letter-input')[1]
    for (const step of [
      'I led a team of eight engineers',
      'I led a team of eight',
      'I shipped the retry',
      'I shipped the retry semantics that cut duplicate postings to zero.',
    ]) {
      fireEvent.change(input(), { target: { value: step } })
    }

    expect(screen.queryByTestId('cover-letter-flag')).toBeNull()
  })

  it('does not let appending to a flagged paragraph launder it', async () => {
    mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    const [, flaggedInput] = screen.getAllByTestId('cover-letter-input')
    fireEvent.change(flaggedInput, {
      target: { value: 'I led a team of eight engineers. Happy to talk through any of it.' },
    })

    expect(screen.getByTestId('cover-letter-flag').textContent).toMatch(/no source/i)
  })

  it('asks before a regenerate throws away the paragraphs the user wrote', async () => {
    const actions = mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    const [own] = screen.getAllByTestId('cover-letter-input')
    fireEvent.change(own, { target: { value: 'Ten minutes of my own writing.' } })

    fireEvent.click(screen.getByTestId('regenerate-cover-letter'))
    expect(actions.draft).not.toHaveBeenCalled()
    expect(screen.getByTestId('regenerate-confirm').textContent).toMatch(/replaces the whole letter/i)

    // Backing out leaves the letter exactly as it was.
    fireEvent.click(screen.getByTestId('cancel-regenerate'))
    expect(screen.queryByTestId('regenerate-confirm')).toBeNull()
    expect(actions.draft).not.toHaveBeenCalled()
    expect((screen.getAllByTestId('cover-letter-input')[0] as HTMLTextAreaElement).value).toBe(
      'Ten minutes of my own writing.',
    )

    fireEvent.click(screen.getByTestId('regenerate-cover-letter'))
    fireEvent.click(screen.getByTestId('confirm-regenerate'))
    await waitFor(() => expect(actions.draft).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('regenerate-confirm')).toBeNull()
  })

  it('regenerates without asking when there is nothing of the user’s to lose', async () => {
    const actions = mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('regenerate-cover-letter'))
    await waitFor(() => expect(actions.draft).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('regenerate-confirm')).toBeNull()
  })

  it('cuts a paragraph the user does not want', async () => {
    mount()
    await waitFor(() => expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('cut-paragraph'))
    expect(screen.getAllByTestId('cover-letter-paragraph')).toHaveLength(1)
  })

  it('degrades with a banner and drafts nothing when there is no key', async () => {
    const actions = mount(
      { load: vi.fn(async () => ({ ok: true as const, draft: null })) },
      false,
    )

    await waitFor(() => expect(screen.getByTestId('degraded-banner')).toBeTruthy())
    expect(actions.draft).not.toHaveBeenCalled()
  })

  it('still lets a keyless user write and pin their own letter', async () => {
    const actions = mount({ load: vi.fn(async () => ({ ok: true as const, draft: null })) }, false)
    await waitFor(() => expect(screen.getByTestId('degraded-banner')).toBeTruthy())

    fireEvent.click(screen.getByTestId('write-cover-letter'))
    fireEvent.change(screen.getByTestId('cover-letter-input'), {
      target: { value: 'Dear Stripe, here is why I want the charge path.' },
    })
    fireEvent.click(screen.getByTestId('save-cover-letter'))

    await waitFor(() => expect(actions.save).toHaveBeenCalledTimes(1))
    const sent = vi.mocked(actions.save).mock.calls[0][1]
    expect(sent.paragraphs[0].origin).toBe('user')
    expect(sent.paragraphs[0].flag).toBeUndefined()
  })

  // The key can go away between the page load that resolved it and the draft —
  // the action says so with a flag on the result, never by wording. The tab used
  // to run /llm key/i over the message, which made the sentence a contract
  // between two files that nothing enforced.
  it('reads the keyless state off the action’s flag, not off its wording', async () => {
    mount({
      load: vi.fn(async () => ({ ok: true as const, draft: null })),
      draft: vi.fn(async () => ({
        ok: false as const,
        error: new CoverLetterUnavailableError().message,
        keyless: true,
      })),
    })

    await waitFor(() => expect(screen.getByTestId('degraded-banner')).toBeTruthy())
    expect(screen.queryByTestId('cover-letter-error')).toBeNull()
  })

  it('treats an unflagged failure as a failure however much it sounds like a key', async () => {
    mount({
      load: vi.fn(async () => ({ ok: true as const, draft: null })),
      draft: vi.fn(async () => ({
        ok: false as const,
        error: 'Anthropic rejected the LLM key you have configured (401).',
      })),
    })

    await waitFor(() => expect(screen.getByTestId('cover-letter-error')).toBeTruthy())
    // A rejected key is not a missing one: the amber "add a key" banner would
    // send the user to add the key they already added.
    expect(screen.queryByTestId('degraded-banner')).toBeNull()
    expect(screen.getByTestId('retry-cover-letter')).toBeTruthy()
  })

  it('shows a real failure inline with a retry, not a spinner that never ends', async () => {
    const actions = mount({
      load: vi.fn(async () => ({ ok: true as const, draft: null })),
      draft: vi.fn(async () => ({ ok: false as const, error: 'The model timed out.' })),
    })

    await waitFor(() => expect(screen.getByTestId('cover-letter-error')).toBeTruthy())
    expect(screen.getByTestId('cover-letter-error').textContent).toContain('The model timed out.')

    fireEvent.click(screen.getByTestId('retry-cover-letter'))
    await waitFor(() => expect(actions.draft).toHaveBeenCalledTimes(2))
  })
})
