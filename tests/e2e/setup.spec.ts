import { expect, test } from '@playwright/test'
import { completeSetup } from './helpers'

test('a fresh install walks through setup and keeps the result', async ({ page }) => {
  await completeSetup(page, {
    buildings: ['Building A', 'Building B'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
  await page.goto('/setup?step=shares')
  await expect(page.getByText('Shares set from January 2026')).toHaveCount(2)
})

test('the share form shows what is left to assign and rejects a wrong total', async ({ page }) => {
  await page.goto('/setup')
  await page.getByLabel('Name', { exact: true }).fill('Emon')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Building name').fill('Building A')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Building A' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Co-owners' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Rafi')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Rafi' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.getByLabel('Share %').nth(0).fill('60')
  await expect(page.getByText('40% left to assign')).toBeVisible()
  await page.getByLabel('Share %').nth(1).fill('30')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Shares must add up to exactly 100%')).toBeVisible()

  await page.getByLabel('Share %').nth(1).fill('40')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Shares set from/)).toBeVisible()
})
