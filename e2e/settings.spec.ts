import { expect, test, type Page } from '@playwright/test'

/**
 * The Phase 0 exit gate: a stranger opens Settings, pastes a key, and it sticks.
 * Everything runs against a throwaway ./.e2e-data directory (see
 * playwright.config.ts) so a run never touches real keys.
 */

const ANTHROPIC_KEY = 'sk-ant-api03-e2e-playwright-key-7788'

/** Cards collapse by default; open the one under test. */
async function openCard(page: Page, providerId: string, name: RegExp) {
  const card = page.locator(`section#${providerId}`)
  await card.getByRole('button', { name }).first().click()
  return card
}

test.describe('Settings — BYOK', () => {
  test('saves a key, keeps it after a reload, and never shows it in the clear', async ({
    page,
  }) => {
    await page.goto('/settings')

    const card = await openCard(page, 'anthropic', /^Anthropic/)
    await expect(card.getByText('Not set')).toBeVisible()

    // The honest-onboarding promise: the consequence is on screen before you type.
    await expect(card.getByText(/What breaks without this/i)).toBeVisible()

    await card.getByLabel('API key').fill(ANTHROPIC_KEY)
    await card.getByRole('button', { name: 'Save' }).click()

    await expect(card.getByText('Configured')).toBeVisible()

    await page.reload()

    const reloaded = await openCard(page, 'anthropic', /^Anthropic/)
    await expect(reloaded.getByText('Configured')).toBeVisible()

    // Masked in the placeholder, never rendered anywhere in the DOM.
    await expect(reloaded.getByLabel('API key')).toHaveAttribute('placeholder', /•/)
    expect(await page.content()).not.toContain(ANTHROPIC_KEY)
  })

  test('counts only actionable providers in the topbar summary', async ({ page }) => {
    await page.goto('/settings')

    const summary = page.getByTestId('provider-summary')
    await expect(summary).toContainText('configured')
    await expect(summary).toContainText('missing')
  })

  test('removes a stored key', async ({ page }) => {
    await page.goto('/settings')

    const card = await openCard(page, 'firecrawl', /^Firecrawl/)
    await card.getByLabel('API key').fill('fc-e2e-test-key-0001')
    await card.getByRole('button', { name: 'Save' }).click()
    await expect(card.getByText('Configured')).toBeVisible()

    await card.getByRole('button', { name: 'Remove' }).click()
    await expect(card.getByText('Not set')).toBeVisible()
  })

  test('offers no provider that cannot do anything', async ({ page }) => {
    await page.goto('/settings')

    // The three stubs were cut on 2026-07-28. LinkedIn in particular: a card
    // asking for your li_at cookie, carrying a Terms-of-Service warning, for a
    // feature that was never going to ship.
    await expect(page.locator('section#linkedin')).toHaveCount(0)
    await expect(page.locator('section#brightdata_scrape')).toHaveCount(0)
    await expect(page.locator('section#brightdata_people')).toHaveCount(0)
    await expect(page.getByText(/Terms of Service/i)).toHaveCount(0)
  })

  test('links straight to where each key is issued', async ({ page }) => {
    await page.goto('/settings')

    const card = await openCard(page, 'apollo', /^Apollo/)
    await card.getByText('How to get this key').click()
    await expect(card.getByRole('link', { name: /Open Apollo/ })).toHaveAttribute(
      'href',
      'https://app.apollo.io/#/settings/integrations/api',
    )
  })
})

test.describe('Dashboard', () => {
  test('offers the first-run path into Settings', async ({ page }) => {
    await page.goto('/')

    // First run is now zero *résumés*, not zero applications — the dashboard
    // leads with the wedge. The path into Settings is still one click, and still
    // the secondary action: keys are optional, not a gate.
    await expect(page.getByRole('heading', { name: /Start with your résumé/i })).toBeVisible()
    await page.getByRole('link', { name: 'Set up your keys' }).click()
    await expect(page).toHaveURL(/\/settings/)
  })
})
