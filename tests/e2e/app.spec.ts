import { expect, test } from '@playwright/test'

test('loads the Edger application shell', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Edger')
})

test('connects, starts, adjusts closeness/intensity, and stops via Escape', async ({ page }) => {
  await page.goto('/')

  const status = page.getByTestId('session-status')
  await expect(status).toHaveText('idle')

  await page.getByRole('button', { name: 'Connect fake device' }).click()
  await expect(status).toHaveText('ready')

  await page.getByLabel('Selected device').selectOption('vibe-1')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(status).toHaveText('running')

  await page.keyboard.press(']')
  await expect(page.getByTestId('closeness-value')).toContainText('2')
  await expect(page.getByTestId('closeness-value')).toContainText('Approaching')

  const intensity = page.locator('.intensity output')
  await expect(intensity).toHaveText('50%')
  await page.keyboard.press('d')
  await expect(intensity).toHaveText('55%')

  await page.keyboard.press('Escape')
  await expect(status).toHaveText('ready')
  await expect(page.getByTestId('closeness-value')).toContainText('1')
  await expect(intensity).toHaveText('50%')

  await page.getByRole('button', { name: 'Disconnect' }).click()
  await expect(status).toHaveText('idle')
})
