import { expect, test } from '@playwright/test'

// Phase 8 e2e gate — the end-goal script from PLAN.md, on fakes, from a wiped
// data dir. This is the Definition of Shipped, executable. RED until P8 lands.
//
// The webServer wipes .e2e-data on boot, so first navigation IS first run.

const JOB_URL = 'https://jobs.example.com/stripe/senior-backend-engineer'

test('a stranger reaches tracked outreach from a cold start', async ({ page }) => {
  // 1. First boot lands in onboarding — no account, no login, ever.
  await page.goto('/')
  await expect(page).toHaveURL(/onboarding/)
  await expect(page.getByTestId('onboarding-step-welcome')).toContainText(/nothing leaves/i)
  await page.getByTestId('onboarding-continue').click()

  // 2. Keys step — every provider is skippable; skipping still completes.
  await expect(page.getByTestId('onboarding-step-keys')).toBeVisible()
  await expect(page.getByTestId('key-row-llm')).toContainText(/the one to add/i)
  await page.getByTestId('onboarding-skip-keys').click()

  // 3. Import résumé — PDF → parse → review/fix with confidence flags.
  await page
    .getByTestId('resume-dropzone')
    .setInputFiles('gates/fixtures/resume/sample-1.pdf')
  await expect(page.getByTestId('import-review')).toBeVisible()
  await page.getByTestId('confirm-import').click()

  // 4. Done → dashboard with a real next action, not a blank screen.
  await page.getByTestId('onboarding-finish').click()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('empty-state-cta')).toBeVisible()

  // 5. Paste a job → tailor → accept & save.
  await page.getByTestId('empty-state-cta').click()
  await page.getByTestId('job-url-input').fill(JOB_URL)
  await page.getByTestId('ingest-job').click()
  await page.getByTestId('pipeline-card').filter({ hasText: 'Stripe' }).first().click()
  await page.getByTestId('tailor-resume').click()
  await page.getByTestId('start-tailor').click()
  await expect(page.getByTestId('diff-row').first()).toBeVisible()
  await page.getByTestId('accept-all-and-save').click()
  await expect(page.getByTestId('pinned-resume')).not.toContainText(/not yet tailored/i)

  // 6. Find the human → outreach → sent (fake adapter) → tracked.
  await page.getByTestId('find-contacts').click()
  await expect(page.getByTestId('contact-card').first()).toBeVisible()
  await page.getByTestId('draft-outreach').click()
  await page.getByTestId('send-now').click()

  await page.goto('/pipeline')
  await expect(
    page.getByTestId('column-outreach').getByTestId('pipeline-card').filter({ hasText: 'Stripe' }),
  ).toBeVisible()
})
