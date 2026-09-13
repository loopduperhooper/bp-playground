import { expect, test } from '@playwright/test'

test('loads the Edger application shell', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Edger')
})
