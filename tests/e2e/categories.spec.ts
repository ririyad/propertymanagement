import { expect, test } from '@playwright/test'
import { completeSetup } from './helpers'

test('renames, adds, hides, reorders and deletes categories', async ({ page }) => {
  await completeSetup(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Categories', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Categories')

  const rows = page.getByRole('main').getByRole('listitem').getByRole('link')
  await expect(rows).toHaveText([
    /^Electricity/,
    /^Caretaker cost/,
    /^Service charge/,
    /^Gas charge/,
    /^Holding tax/,
    /^Other tax/,
    /^Repairs and maintenance/,
    /^Misc/,
  ])
  await expect(page.getByRole('button', { name: 'Move Electricity up' })).toBeDisabled()

  await page.getByRole('link', { name: 'Add category' }).click()
  await page.getByLabel('Category name').fill('electricity')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('A category with this name already exists')).toBeVisible()
  await page.getByLabel('Category name').fill('Water')
  await page.getByLabel('Split by default').selectOption({ label: 'Equally between owners' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows.last()).toHaveText(/^Water\s*One-off cost · Equally between owners$/)

  await page.getByRole('button', { name: 'Move Water up' }).click()
  await expect(rows.nth(7)).toHaveText(/^Water/)
  await expect(rows.last()).toHaveText(/^Misc/)

  await rows.last().click()
  await expect(page.getByLabel('Type')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await page.getByLabel('Category name').fill('Miscellaneous')
  await page.getByLabel('Hide from new expenses').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows.last()).toHaveText(/^Miscellaneous.*Built in · Hidden$/)

  await page.getByRole('link', { name: /^Water/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Categories')
  await expect(rows).toHaveCount(8)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows.nth(7)).toHaveText(/^Water/)
})
