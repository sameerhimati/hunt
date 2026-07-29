// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DegradedBanner } from '@/components/degraded-banner'
import { PROVIDERS } from '@/lib/providers/registry'

/**
 * The banner's whole job is to end with the user on the card that fixes it, so
 * where the link lands is the part worth pinning.
 *
 * `key-provider-card.tsx` renders `id={meta.id}` on every card and
 * `settings/page.tsx` renders `id={`section-${category}`}` on every heading.
 * Both anchors are real; the banner could only reach the second, which meant a
 * feature blocked on one specific provider still dropped the user above a list
 * of cards and left them to find it.
 */
afterEach(cleanup)

function link() {
  return screen.getByTestId('degraded-banner-link') as HTMLAnchorElement
}

function mount(extra: { settingsProvider?: string } = {}) {
  render(
    <DegradedBanner
      feature="Searching the job boards"
      needs="a JSearch or Adzuna key"
      stillWorks="Company boards are already searchable."
      settingsSection="jobs"
      {...extra}
    />,
  )
}

describe('the degraded banner’s link', () => {
  it('lands on the provider card when one provider is named', () => {
    mount({ settingsProvider: 'adzuna' })

    expect(link().getAttribute('href')).toBe('/settings#adzuna')
  })

  it('falls back to the category heading when no single provider is to blame', () => {
    mount()

    expect(link().getAttribute('href')).toBe('/settings#section-jobs')
  })

  it('speaks the anchor grammar the Settings cards actually render', () => {
    // The registry is the list of ids `key-provider-card` puts on the DOM, so
    // an id from it is an anchor that exists — no second list to drift.
    for (const provider of PROVIDERS) {
      cleanup()
      mount({ settingsProvider: provider.id })
      expect(link().getAttribute('href')).toBe(`/settings#${provider.id}`)
    }
  })
})
