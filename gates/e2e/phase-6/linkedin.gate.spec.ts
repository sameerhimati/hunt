import { expect, test } from '@playwright/test'

// Phase 6 e2e gate — the at-own-risk posture is visible and off by default.

test('LinkedIn card carries the disclaimer and defaults to off', async ({ page }) => {
  await page.goto('/settings')

  const card = page.getByTestId('provider-card-linkedin')
  await expect(card).toBeVisible()
  await expect(card).toContainText(/Terms of Service/i)
  await expect(card).toContainText(/risk/i)
  await expect(card).toContainText(/read/i) // read-only promise on the card

  // Off unless the user explicitly accepts the risk.
  await expect(card.getByTestId('linkedin-enabled')).toContainText(/off/i)
})
