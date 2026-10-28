import { expect, test } from '@playwright/test'
import { completeSetup } from './helpers'

test('summarises the month by category and owner, with bills to pay and quick actions', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })
  await expect(page.getByText('No expenses in October 2026 yet')).toBeVisible()

  // The quick actions open the expense editor.
  const quick = page.getByRole('button', { name: 'Quick actions' })
  await quick.click()
  await expect(quick).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('link', { name: 'Enter readings' })).toBeVisible()
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount (৳)').fill('8,000')
  await page.getByLabel('Category').selectOption({ label: 'Caretaker cost' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Expense saved')).toBeVisible()

  await page.goto('/expenses/new')
  await page.getByLabel('Amount (৳)').fill('1,200')
  await page.getByLabel('Category').selectOption({ label: 'Gas charge' })
  await page.getByLabel('Already paid').uncheck()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Expense saved')).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click()
  await expect(page.getByRole('main')).toContainText('Expenses in October 2026৳9,200')
  await expect(page.getByRole('region', { name: 'By category' }).getByRole('listitem')).toHaveText([
    /Caretaker cost\s*৳8,000/,
    /Gas charge\s*৳1,200/,
  ])
  const byOwner = page.getByRole('region', { name: "Each owner's share" })
  await expect(byOwner.getByRole('listitem')).toHaveText([
    /Emon\s*৳4,600/,
    /Rafi\s*৳2,760/,
    /Nila\s*৳1,840/,
  ])
  await expect(page.getByRole('region', { name: 'Bills to pay' }).getByRole('listitem')).toHaveText(
    [/Gas charge\s*October 2026\s*৳1,200/],
  )

  await byOwner.getByRole('link', { name: /Rafi/ }).click()
  await expect(page).toHaveURL(/\/expenses\?month=2026-10&owner=/)
  await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(2)
})
