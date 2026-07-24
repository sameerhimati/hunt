import { expect, test } from '@playwright/test'

// Phase 5 e2e gate — search → honest fit tiers with reasons → pull into
// pipeline. Fake jobs adapter serves its fixtures; scripted LLM rates them
// (gates/fixtures/llm/rate-batch.json). RED until /sourcing lands.

test('search → rated results → why-it-fits → pull into pipeline', async ({ page }) => {
  await page.goto('/sourcing')

  await page.getByTestId('search-keywords').fill('backend')
  await page.getByTestId('search-jobs').click()

  const results = page.getByTestId('sourcing-result')
  await expect(results.first()).toBeVisible()

  // Qualitative tiers only — Strong/Possible/Reach, never a percentage.
  await expect(page.getByTestId('fit-tier-badge').first()).toContainText(
    /strong|possible|reach/i,
  )
  await expect(page.locator('body')).not.toContainText(/\d+%\s*(match|fit)/i)

  // Strong results explain themselves, traced to the résumé.
  const strong = results.filter({ hasText: /strong/i }).first()
  await strong.getByTestId('why-it-fits-toggle').click()
  await expect(strong.getByTestId('why-it-fits')).toBeVisible()

  // One click into the pipeline as a sourced application.
  await strong.getByTestId('pull-into-pipeline').click()
  await page.goto('/pipeline')
  await expect(
    page.getByTestId('column-sourced').getByTestId('pipeline-card').first(),
  ).toBeVisible()
})

test('saved searches persist and re-run', async ({ page }) => {
  await page.goto('/sourcing')
  await page.getByTestId('search-keywords').fill('platform')
  await page.getByTestId('search-jobs').click()
  await page.getByTestId('save-search').click()

  await page.reload()
  await expect(page.getByTestId('saved-search-chip').filter({ hasText: 'platform' })).toBeVisible()
})
