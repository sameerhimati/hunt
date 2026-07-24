import fs from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

// Phase 4 e2e gate — manual contact → drafted sequence → send lands in the
// fake adapter's outbox capture (.e2e-data/outbox.jsonl). No mail server, no
// Docker: the capture file IS the observable send. RED until P4 lands.

const JOB_URL = 'https://jobs.example.com/stripe/senior-backend-engineer'
const OUTBOX = path.resolve(process.cwd(), '.e2e-data/outbox.jsonl')

test('find the human → draft → send → tracked', async ({ page }) => {
  await page.goto('/pipeline')
  await page.getByTestId('new-application').click()
  await page.getByTestId('job-url-input').fill(JOB_URL)
  await page.getByTestId('ingest-job').click()
  await page.getByTestId('pipeline-card').filter({ hasText: 'Stripe' }).first().click()

  // Manual contact — outreach must work without an Apollo key.
  await page.getByTestId('add-contact-manual').click()
  await page.getByTestId('contact-name').fill('Jordan Lee')
  await page.getByTestId('contact-email').fill('jordan@example.com')
  await page.getByTestId('save-contact').click()
  await expect(page.getByTestId('contact-card').filter({ hasText: 'Jordan Lee' })).toBeVisible()

  // Draft a sequence from the contact.
  await page.getByTestId('draft-outreach').click()
  await expect(page.getByTestId('sequence-timeline')).toBeVisible()
  await expect(page.getByTestId('sequence-step').first()).toBeVisible()
  await expect(page.getByTestId('message-subject')).not.toBeEmpty()

  // Send step 1.
  await page.getByTestId('send-now').click()
  await expect(page.getByTestId('sequence-step').first()).toContainText(/sent/i)

  // The message observably left through the (fake) adapter.
  await expect.poll(() => fs.existsSync(OUTBOX)).toBe(true)
  const outbox = fs
    .readFileSync(OUTBOX, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(outbox.some((m) => m.to === 'jordan@example.com')).toBe(true)
})

test('no email key → composer still works, send degrades to copy/mark-sent', async ({ page }) => {
  // HUNT_TEST_MODE ships a working fake email adapter, so this asserts the
  // pattern at the UI layer: the degraded affordance exists in the send menu.
  await page.goto('/outreach')
  await expect(page.getByTestId('outreach-queue')).toBeVisible()
  await expect(page.getByTestId('mark-sent-manually')).toBeAttached()
})
