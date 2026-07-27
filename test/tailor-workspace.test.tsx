// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { TailorWorkspace } from '@/components/tailor/tailor-workspace'
import type { CoverLetterDraft } from '@/lib/tailor/cover-letter'
import type { TailorChange, TailorRun } from '@/lib/tailor/types'

/**
 * The workspace holds every decision of a run, and two of its states cost the
 * user real money or real work: leaving the Cover letter tab, and pressing the
 * commit twice. Both are driven here with the route's server actions stubbed,
 * so nothing needs a database, a model or Tectonic.
 */

const runTailorAction = vi.fn()
const saveTailoredVersionAction = vi.fn()
const draftCoverLetterAction = vi.fn()
const loadCoverLetterAction = vi.fn()
const saveCoverLetterAction = vi.fn()

vi.mock('@/app/applications/[id]/tailor/actions', () => ({
  runTailorAction: (...args: unknown[]) => runTailorAction(...args),
  saveTailoredVersionAction: (...args: unknown[]) => saveTailoredVersionAction(...args),
  draftCoverLetterAction: (...args: unknown[]) => draftCoverLetterAction(...args),
  loadCoverLetterAction: (...args: unknown[]) => loadCoverLetterAction(...args),
  saveCoverLetterAction: (...args: unknown[]) => saveCoverLetterAction(...args),
}))

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/applications/app1/tailor',
}))

const success = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => success(...args), error: vi.fn() },
}))

// The live paper compiles through an API route; the workspace's state machine is
// what's under test, not Tectonic.
vi.mock('@/components/resume/pdf-preview-frame', () => ({
  PdfPreviewFrame: () => null,
}))

afterEach(cleanup)

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const content = fs.readFileSync(
  path.resolve(process.cwd(), 'gates/fixtures/resume/alex-chen.json'),
  'utf8',
)

const job = { title: 'Senior Backend Engineer', company: 'Stripe' }

const change = (overrides: Partial<TailorChange> = {}): TailorChange => ({
  id: 'c1',
  kind: 'edit',
  path: 'experience[0].bullets[0]',
  was: 'Own the ledger service that settles $40M/month in card transactions across three processors',
  now: 'Own the charge path: a ledger service settling $40M/month across three processors',
  why: 'The posting leads with the charge path.',
  citation: {
    path: 'experience[0].bullets[0]',
    snippet: 'Own the ledger service that settles $40M/month',
  },
  status: 'proposed',
  ...overrides,
})

const run: TailorRun = {
  changes: [change(), change({ id: 'c2', path: 'basics.summary', was: null, kind: 'add' })],
  baseVersionId: 'v1',
  job: { title: job.title, company: job.company, jdText: 'Own the charge path.' },
}

const letter: CoverLetterDraft = {
  applicationId: 'app1',
  savedAt: null,
  paragraphs: [
    {
      id: 'p1',
      text: 'I own the ledger service that settles $40M a month.',
      citations: [
        { path: 'experience[0].bullets[0]', source: 'resume', snippet: 'settles $40M/month' },
      ],
      origin: 'model',
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  runTailorAction.mockResolvedValue({ ok: true, run })
  saveTailoredVersionAction.mockResolvedValue({
    ok: true,
    version: { id: 'v2', label: 'Stripe — Senior Backend Engineer', resumeId: 'r1' },
  })
  loadCoverLetterAction.mockResolvedValue({ ok: true, draft: null })
  draftCoverLetterAction.mockResolvedValue({ ok: true, draft: letter })
  saveCoverLetterAction.mockImplementation(async (_id: string, draft: CoverLetterDraft) => ({
    ok: true,
    draft: { ...draft, savedAt: '2026-07-25T11:00:00.000Z' },
  }))
})

function mount() {
  return render(
    <TailorWorkspace
      applicationId="app1"
      job={job}
      resumes={[
        {
          id: 'r1',
          name: 'Alex Chen',
          versions: [
            {
              id: 'v1',
              resumeId: 'r1',
              label: 'Base',
              depth: 0,
              templateId: 'classic',
              rawLatexOverride: null,
              content,
            },
          ],
        },
      ]}
      initialBaseVersionId="v1"
      hasLlm
      defaultLabel="Stripe — Senior Backend Engineer"
    />,
  )
}

/** Radix activates a tab on mousedown, not click. */
function switchTab(testId: string) {
  fireEvent.mouseDown(screen.getByTestId(testId), { button: 0 })
}

/**
 * Gets the run past the start screen and into the two-tab review. Waits for the
 * commit to go live, not just for the tabs: the run's own transition leaves it
 * disabled for a beat after `run` lands, and a click in that window is dropped.
 */
async function startRun() {
  mount()
  fireEvent.click(screen.getByTestId('start-tailor'))
  await waitFor(() =>
    expect((screen.getByTestId('save-tailored-version') as HTMLButtonElement).disabled).toBe(false),
  )
}

describe('the cover letter survives a trip to the résumé tab', () => {
  it('does not re-draft, and does not lose the user’s edits, on the way back', async () => {
    await startRun()

    switchTab('tab-cover-letter')
    await waitFor(() => expect(draftCoverLetterAction).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByTestId('cover-letter-input'), {
      target: { value: 'Two paragraphs I rewrote by hand over ten minutes.' },
    })

    switchTab('tab-resume-changes')
    await waitFor(() => expect(screen.getByTestId('tailor-summary')).toBeTruthy())

    switchTab('tab-cover-letter')
    await waitFor(() => expect(screen.getByTestId('cover-letter-tab')).toBeTruthy())

    // Nothing was saved, so a remount would have spent a second model call and
    // replaced the user's prose with the model's.
    expect(draftCoverLetterAction).toHaveBeenCalledTimes(1)
    expect((screen.getByTestId('cover-letter-input') as HTMLTextAreaElement).value).toBe(
      'Two paragraphs I rewrote by hand over ten minutes.',
    )
  })

  it('spends nothing on a tab the user never opened', async () => {
    await startRun()

    // Give the mount effect every chance to fire.
    await waitFor(() => expect(screen.getByTestId('tailor-summary')).toBeTruthy())
    expect(loadCoverLetterAction).not.toHaveBeenCalled()
    expect(draftCoverLetterAction).not.toHaveBeenCalled()
  })
})

describe('committing the tailored version exactly once', () => {
  it('ignores a second ⌘↵ while the first save is still in flight', async () => {
    let release!: () => void
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    saveTailoredVersionAction.mockImplementation(async () => {
      await inFlight
      return { ok: true, version: { id: 'v2', label: 'Stripe', resumeId: 'r1' } }
    })

    await startRun()

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    release()
    await waitFor(
      () => expect(screen.getByTestId('save-tailored-version').textContent).toBe('Saved'),
      { timeout: 3000 },
    )
    expect(saveTailoredVersionAction).toHaveBeenCalledTimes(1)
  })

  it('disables the commit once the decisions on screen are the ones that were saved', async () => {
    await startRun()

    const button = () => screen.getByTestId('save-tailored-version') as HTMLButtonElement
    fireEvent.click(button())
    await waitFor(() => expect(button().textContent).toBe('Saved'), { timeout: 3000 })

    expect(button().disabled).toBe(true)
    fireEvent.click(button())
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    expect(saveTailoredVersionAction).toHaveBeenCalledTimes(1)
  })

  it('re-opens the commit when the user changes a decision after saving', async () => {
    await startRun()

    const button = () => screen.getByTestId('save-tailored-version') as HTMLButtonElement
    fireEvent.click(button())
    await waitFor(() => expect(button().textContent).toBe('Saved'), { timeout: 3000 })

    // `r` rejects the selected change — the document on screen is no longer the
    // one that was saved, so saving again is a new version, not a duplicate.
    fireEvent.keyDown(window, { key: 'r' })
    await waitFor(() => expect(button().disabled).toBe(false))
    expect(button().textContent).toMatch(/new version/i)

    fireEvent.click(button())
    await waitFor(() => expect(saveTailoredVersionAction).toHaveBeenCalledTimes(2))
  })
})
