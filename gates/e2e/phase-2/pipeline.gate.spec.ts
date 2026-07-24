import { expect, test } from '@playwright/test'

// Phase 2 e2e gate — paste URL → job card → application → status change that
// survives a reload; manual fallback; honest dashboard funnel. Runs in
// HUNT_TEST_MODE (fake Firecrawl serves gates/fixtures/jobs/stripe-sbe.md).
// Status changes use the status control, not drag — dnd is human-verified.

const JOB_URL = 'https://jobs.example.com/stripe/senior-backend-engineer'

test.describe('pipeline spine', () => {
  test('paste a URL → card in Sourced → detail → advance status → persists', async ({ page }) => {
    await page.goto('/pipeline')

    await page.getByTestId('new-application').click()
    await page.getByTestId('job-url-input').fill(JOB_URL)
    await page.getByTestId('ingest-job').click()

    const card = page.getByTestId('pipeline-card').filter({ hasText: 'Stripe' })
    await expect(page.getByTestId('column-sourced').getByTestId('pipeline-card').filter({ hasText: 'Stripe' })).toBeVisible()

    // Application detail is the hub: JD, pinned résumé slot, checks slot.
    await card.first().click()
    await expect(page.getByText('latency SLOs')).toBeVisible()
    await expect(page.getByTestId('pinned-resume')).toBeVisible()

    // Advance the status from the detail header.
    await page.getByTestId('status-select').click()
    await page.getByTestId('status-option-applied').click()

    await page.goto('/pipeline')
    await expect(
      page.getByTestId('column-applied').getByTestId('pipeline-card').filter({ hasText: 'Stripe' }),
    ).toBeVisible()

    // Survives a full reload — it's in SQLite, not component state.
    await page.reload()
    await expect(
      page.getByTestId('column-applied').getByTestId('pipeline-card').filter({ hasText: 'Stripe' }),
    ).toBeVisible()
  })

  test('manual entry works with zero keys — the keyless floor', async ({ page }) => {
    await page.goto('/pipeline')
    await page.getByTestId('new-application').click()
    await page.getByTestId('manual-entry-tab').click()
    await page.getByTestId('manual-title').fill('Staff Engineer')
    await page.getByTestId('manual-company').fill('Linear')
    await page.getByTestId('create-manual-job').click()

    await expect(
      page.getByTestId('column-sourced').getByTestId('pipeline-card').filter({ hasText: 'Linear' }),
    ).toBeVisible()
  })

  test('dashboard funnel reports real counts, never a grade', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('funnel-stats')).toBeVisible()
    await expect(page.getByTestId('funnel-stat').first()).toBeVisible()
    // The honesty rule in one assertion: no "score" language on the dashboard.
    await expect(page.locator('body')).not.toContainText(/ATS score/i)
  })
})
