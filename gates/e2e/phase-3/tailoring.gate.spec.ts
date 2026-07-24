import { expect, test } from '@playwright/test'

// Phase 3 e2e gate — the hero screen (TAILORING-DIFF.md). Scripted fake LLM
// returns one citable edit and two fabrications; the UI must show the diff,
// surface the refusals as FabricationFlags, and save an accepted child version
// pinned to the application. RED until the tailoring flow exists.

const JOB_URL = 'https://jobs.example.com/stripe/senior-backend-engineer'

test('tailor → review diff → fabrication flag → accept → save pinned version', async ({ page }) => {
  // Arrange through the product, not the DB: résumé + application.
  await page.goto('/resumes')
  await page.getByTestId('new-resume').click()
  await page.getByTestId('resume-name-input').fill('Alex Chen')
  await page.getByTestId('create-resume').click()

  await page.goto('/pipeline')
  await page.getByTestId('new-application').click()
  await page.getByTestId('job-url-input').fill(JOB_URL)
  await page.getByTestId('ingest-job').click()
  await page.getByTestId('pipeline-card').filter({ hasText: 'Stripe' }).first().click()

  // Run the tailor from the application.
  await page.getByTestId('tailor-resume').click()
  await page.getByTestId('start-tailor').click()

  // The reviewable diff — never a silent rewrite.
  await expect(page.getByTestId('diff-row').first()).toBeVisible()

  // The honesty moment: refused claims are visible, struck through, unapplied.
  const flag = page.getByTestId('fabrication-flag').first()
  await expect(flag).toBeVisible()
  await expect(flag).toContainText(/no source/i)

  // Accept the citable change; inspect its provenance.
  await page.getByTestId('diff-row').first().click()
  await expect(page.getByTestId('change-inspector')).toContainText(/WHY/i)
  await expect(page.getByTestId('citation-chip')).toContainText('experience[0]')
  await page.getByTestId('accept-change').first().click()

  // Save as a child version pinned to the application.
  await page.getByTestId('save-tailored-version').click()
  await expect(page.getByTestId('pinned-resume')).not.toContainText(/not yet tailored/i)

  // Refused text never reaches the document.
  await expect(page.getByTestId('pdf-preview')).not.toContainText('12-person team')
})

test('checks panel shows the four named checks and refuses the fake-score framing', async ({
  page,
}) => {
  await page.goto('/pipeline')
  await page.getByTestId('pipeline-card').filter({ hasText: 'Stripe' }).first().click()

  await page.getByTestId('run-checks').click()
  const panel = page.getByTestId('checks-panel')
  await expect(panel.getByTestId('check-card')).toHaveCount(4)
  await expect(panel).toContainText(/no fake ATS score/i)
  await expect(panel).not.toContainText(/\d+\s*\/\s*100/)
})
