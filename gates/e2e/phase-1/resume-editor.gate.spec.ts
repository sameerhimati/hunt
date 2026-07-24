import { expect, test } from '@playwright/test'

// Phase 1 e2e gate — the Overleaf split: structured editor + live preview +
// version tree + semantic compare. The data-testid values used here are the
// UI contract for P1 builders. RED until /resumes exists.

test.describe('résumé editor', () => {
  test('create → edit → save version → compare shows a semantic diff', async ({ page }) => {
    await page.goto('/resumes')

    // Empty state offers a start — never a blank panel (SCREENS §5, §11).
    await page.getByTestId('new-resume').click()
    await page.getByTestId('resume-name-input').fill('Alex Chen')
    await page.getByTestId('create-resume').click()

    // The Overleaf split is on screen.
    await expect(page.getByTestId('structured-editor')).toBeVisible()
    await expect(page.getByTestId('pdf-preview')).toBeVisible()

    // Edit a structured field.
    await page.getByTestId('field-basics-name').fill('Alex Chen')
    await page.getByTestId('field-basics-label').fill('Backend Engineer')

    // Save as a named version — the tree grows a child.
    await page.getByTestId('save-version').click()
    await page.getByTestId('version-label-input').fill('sharper headline')
    await page.getByTestId('confirm-save-version').click()
    await expect(page.getByTestId('version-node')).toHaveCount(2)

    // Compare any two versions → read-only DiffRows (same language as tailoring).
    await page.getByTestId('compare-versions').click()
    await expect(page.getByTestId('diff-row').first()).toBeVisible()
  })

  test('raw LaTeX tab warns that edits detach from structured editing', async ({ page }) => {
    await page.goto('/resumes')
    await page.getByTestId('resume-card').first().click()

    await page.getByTestId('tab-raw-latex').click()
    await expect(page.getByTestId('raw-latex-warning')).toContainText(/detach/i)
  })
})
