import { expect, test } from '@playwright/test'

test('loads the Edger application shell', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Edger')
})

test('connects, starts, adjusts closeness, and stops via Escape', async ({ page }) => {
  await page.goto('/')

  const status = page.getByTestId('session-status')
  await expect(status).toHaveText('idle')

  await page.getByRole('button', { name: 'Connect fake device' }).click()
  await expect(status).toHaveText('ready')

  await page.getByLabel('Selected device').selectOption('vibe-1')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(status).toHaveText('running')

  await expect(page.getByTestId('diagnostics-command')).not.toHaveText('—')

  await page.keyboard.press('d')
  await expect(page.getByTestId('closeness-value')).toContainText('2')
  await expect(page.getByTestId('closeness-value')).toContainText('Approaching')

  await page.keyboard.press('a')
  await expect(page.getByTestId('closeness-value')).toContainText('1')
  await expect(page.getByTestId('closeness-value')).toContainText('Far')

  await page.keyboard.press('d')
  await page.keyboard.press('Escape')
  await expect(status).toHaveText('ready')
  await expect(page.getByTestId('closeness-value')).toContainText('1')

  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(status).toHaveText('idle')
})

test('reports a real connection failure when using the real Intiface transport', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Real Intiface' }).click()

  // Nothing listens on this port in the test environment, so this exercises
  // ButtplugTransport's real WebSocket connect-failure path end to end,
  // through the same main Connect button the fake-device flow uses.
  await page.getByRole('button', { name: 'Connect' }).click()

  await expect(page.getByTestId('diagnostics-error')).toContainText('Failed to connect to Intiface at ws://127.0.0.1:12345')
  await expect(page.getByTestId('session-status')).toHaveText('idle')
})
