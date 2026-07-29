// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The list is the only place archiving is visible, so it owns two promises:
 * archived résumés leave the grid without leaving the app, and "delete
 * permanently" is offered only where it destroys nothing.
 */
const listResumes = vi.hoisted(() => vi.fn())
const listArchivedResumes = vi.hoisted(() => vi.fn())
const resumeApplicationCount = vi.hoisted(() => vi.fn<(id: string) => Promise<number>>())

vi.mock('@/lib/resume/store', () => ({
  listResumes,
  listArchivedResumes,
  resumeApplicationCount,
}))
vi.mock('@/app/resumes/actions', () => ({
  archiveResumeAction: vi.fn(),
  restoreResumeAction: vi.fn(),
  deleteResumeAction: vi.fn(),
}))
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/resume/new-resume-dialog', () => ({ NewResumeDialog: () => null }))

const ResumesPage = (await import('@/app/resumes/page')).default

afterEach(cleanup)

function resume(id: string, name: string, versions = 1) {
  return {
    id,
    name,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: Array.from({ length: versions }, (_, index) => ({
      id: `${id}-v${index}`,
      parentVersionId: index === 0 ? null : `${id}-v0`,
    })),
  }
}

async function renderPage() {
  render(await ResumesPage())
}

describe('the résumé list', () => {
  it('keeps archived résumés off the grid but reachable on the shelf', async () => {
    listResumes.mockResolvedValue([resume('r1', 'Alex Chen')])
    listArchivedResumes.mockResolvedValue([resume('r2', 'Old résumé')])
    resumeApplicationCount.mockResolvedValue(0)

    await renderPage()

    expect(screen.getAllByTestId('resume-card')).toHaveLength(1)
    expect(screen.getByTestId('archived-resumes').textContent).toContain('Archived (1)')
    expect(screen.getByTestId('archived-resume-row').textContent).toContain('Old résumé')
    expect(screen.getByTestId('restore-resume')).toBeTruthy()
  })

  it('offers a permanent delete only when no application pins a version', async () => {
    listResumes.mockResolvedValue([])
    listArchivedResumes.mockResolvedValue([resume('r2', 'Sent to Stripe')])
    resumeApplicationCount.mockResolvedValue(2)

    await renderPage()

    expect(screen.queryByTestId('delete-resume')).toBeNull()
    expect(screen.getByTestId('delete-blocked').textContent).toContain('2 applications pin a version')

    cleanup()
    resumeApplicationCount.mockResolvedValue(0)
    await renderPage()

    expect(screen.getByTestId('delete-resume')).toBeTruthy()
  })

  it('gives every listed résumé a way out', async () => {
    listResumes.mockResolvedValue([resume('r1', 'Alex Chen'), resume('r3', 'Alex Chen — infra')])
    listArchivedResumes.mockResolvedValue([])
    resumeApplicationCount.mockResolvedValue(0)

    await renderPage()

    expect(screen.getAllByTestId('archive-resume')).toHaveLength(2)
    expect(screen.queryByTestId('archived-resumes')).toBeNull()
  })
})
