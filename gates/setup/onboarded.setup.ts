import { expect, test } from '@playwright/test'

/**
 * Puts the shared gate server into the state every gate except one assumes: an
 * app somebody has already set up.
 *
 * The dashboard redirects to the wizard until onboarding is finished, so
 * without this the phase gates that visit `/` meet a first run instead of the
 * screen they are asserting. It walks the wizard the way a user in a hurry
 * would — **skipping every step** — which is deliberate on two counts: it is
 * the path that must work (nothing in hunt is required), and it finishes
 * without creating a résumé, an application or a contact, so the gates that run
 * after it still start from an empty app.
 *
 * It is a setup project rather than a gate. It asserts nothing about the
 * product; the first-run experience is the golden path's subject, and that runs
 * on its own server precisely so it can meet a cold machine.
 */
test('complete onboarding so the gates meet a set-up app', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/onboarding/)

  await page.getByTestId('onboarding-continue').click()
  await page.getByTestId('onboarding-skip-keys').click()
  await page.getByTestId('onboarding-skip-import').click()
  await page.getByTestId('onboarding-finish').click()

  await expect(page).toHaveURL('/')
})
