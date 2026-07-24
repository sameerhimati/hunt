import { expect, test } from '@playwright/test'

// Phase 8 e2e gate — the trust claims, enforced: a CSP ships, and a dashboard
// session makes ZERO requests off the machine. "No telemetry" is a test, not
// a promise. RED until the P8 security pass lands.

test('a CSP header ships on every page', async ({ page }) => {
  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toBeTruthy()
})

test('nothing leaves the machine during normal use', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url())
  })

  await page.goto('/')
  await page.goto('/pipeline')
  await page.goto('/settings')

  expect(external, `external requests detected:\n${external.join('\n')}`).toEqual([])
})
