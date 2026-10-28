import { expect, test } from '@playwright/test'
import { completeSetup } from './helpers'

test('adds, edits and deletes owners and buildings with undo', async ({ page }) => {
  await completeSetup(page, { buildings: ['Building A'], coOwners: ['Rafi'] })
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()

  await page.getByRole('link', { name: 'Owners', exact: true }).click()
  await page.getByRole('link', { name: 'Add owner' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Nila')
  await page.getByLabel('Relation (optional)').fill('Sister')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nila')
  await expect(page.getByText('No shares in any building')).toBeVisible()

  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Owners')
  await expect(page.getByRole('link', { name: /Nila/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: /Nila/ })).toBeVisible()

  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('link', { name: 'Buildings', exact: true }).click()
  await page.getByRole('link', { name: 'Add building' }).click()
  await page.getByLabel('Building name').fill('Building A')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('A building with this name already exists')).toBeVisible()
  await page.getByLabel('Building name').fill('Building B')
  await page.getByLabel('Group (optional)').fill('Mirpur')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Building B')
  await expect(page.getByText('Mirpur')).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Address (optional)').fill('Road 3, Mirpur')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Road 3, Mirpur')).toBeVisible()
})
