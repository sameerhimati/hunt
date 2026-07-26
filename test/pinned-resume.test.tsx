// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PinnedResume } from '@/components/application/pinned-resume'

const pathname = vi.hoisted(() => ({ current: '/applications/app_1' }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))

afterEach(() => {
  pathname.current = '/applications/app_1'
  cleanup()
})

describe('PinnedResume', () => {
  it('says "Not yet tailored" and offers the tailor CTA before a version is pinned', () => {
    render(<PinnedResume resumeId={null} resumeName={null} versionLabel={null} />)

    const card = screen.getByTestId('pinned-resume')
    expect(card.textContent).toMatch(/not yet tailored/i)

    const cta = screen.getByTestId('tailor-resume')
    expect(cta.getAttribute('href')).toBe('/applications/app_1/tailor')
  })

  it('shows the version and drops the un-tailored copy once pinned', () => {
    render(
      <PinnedResume
        resumeId="res_1"
        resumeName="Alex Chen"
        versionLabel="v4"
        company="Stripe"
      />,
    )

    const card = screen.getByTestId('pinned-resume')
    expect(card.textContent).toContain('Alex Chen — Stripe')
    expect(card.textContent).toContain('v4 · tailored from base')
    // The e2e gate asserts the absence of this phrase after saving.
    expect(card.textContent).not.toMatch(/not yet tailored/i)

    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/resumes/res_1')
    expect(screen.getByTestId('tailor-resume').getAttribute('href')).toBe('/applications/app_1/tailor')
  })

  it('derives the tailor href from deeper application routes and honours an explicit id', () => {
    pathname.current = '/applications/app_9/tailor'
    const { unmount } = render(<PinnedResume />)
    expect(screen.getByTestId('tailor-resume').getAttribute('href')).toBe('/applications/app_9/tailor')
    unmount()

    render(<PinnedResume applicationId="app_x" compact />)
    expect(screen.getByTestId('tailor-resume').getAttribute('href')).toBe('/applications/app_x/tailor')
  })

  it('falls back to the pipeline when rendered off an application route', () => {
    pathname.current = '/resumes/res_1'
    render(<PinnedResume />)
    expect(screen.getByTestId('tailor-resume').getAttribute('href')).toBe('/pipeline')
  })
})
