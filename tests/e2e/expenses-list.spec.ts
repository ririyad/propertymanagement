import { expect, test, type Page } from '@playwright/test'
import { completeSetup } from './helpers'

async function addExpense(
  page: Page,
  { amount, category, building, split }: Record<string, string>,
) {
  await page.goto('/expenses/new')
  await page.getByLabel('Amount (৳)').fill(amount ?? '')
  await page.getByLabel('Category').selectOption({ label: category ?? '' })
  await page.getByLabel('Building').selectOption({ label: building ?? '' })
  if (split) await page.getByLabel('Split').selectOption({ label: split })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Expense saved')).toBeVisible()
}

test('lists a month of expenses with filters, owner totals, details and undoable delete', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A', 'Building B'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })
  await addExpense(page, { amount: '8,000', category: 'Caretaker cost', building: 'Building A' })
  await addExpense(page, {
    amount: '100',
    category: 'Repairs and maintenance',
    building: 'Building B',
    split: 'Equally between owners',
  })
  await addExpense(page, {
    amount: '500',
    category: 'Misc',
    building: 'Building A',
    split: 'Paid by the tenant',
  })

  await expect(page).toHaveURL('/expenses?month=2026-10')
  const rows = page.getByRole('main').getByRole('listitem')
  const totals = page.getByRole('region', { name: 'Total for October 2026' })
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('link', { name: /Caretaker cost/ })).toContainText(
    'Building A · 15 Oct 2026 · Paid by Emon',
  )
  await expect(page.getByRole('link', { name: /Misc/ })).toContainText('Paid by the tenant')
  await expect(totals.getByRole('definition')).toHaveText([
    '৳8,100',
    '৳4,033.34',
    '৳2,433.33',
    '৳1,633.33',
  ])
  await expect(totals).toContainText('listed for reference and not counted')

  await page.getByLabel('Building').selectOption({ label: 'Building B' })
  await expect(rows).toHaveCount(1)
  await expect(totals.getByRole('definition').first()).toHaveText('৳100')
  await page.getByLabel('Building').selectOption({ label: 'All buildings' })
  await page.getByLabel(/^Owner/).selectOption({ label: 'Rafi' })
  await expect(rows).toHaveCount(2)
  await expect(page.getByRole('link', { name: /Caretaker cost/ })).toContainText('Rafi: ৳2,400')
  await expect(totals.getByRole('definition')).toHaveText(['৳8,100', '৳2,433.33'])
  await page.getByLabel(/^Owner/).selectOption({ label: 'All owners' })
  await page.getByLabel('Category').selectOption({ label: 'Misc' })
  await expect(rows).toHaveCount(1)
  await expect(totals.getByRole('definition').first()).toHaveText('৳0')
  await page.getByLabel('Category').selectOption({ label: 'All categories' })
  await page.getByLabel('Month').fill('2026-09')
  await expect(page.getByText('No expenses in September 2026')).toBeVisible()
  await page.getByLabel('Month').fill('2026-10')

  await page.getByRole('link', { name: /Caretaker cost/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Caretaker cost')
  await expect(page.getByRole('main')).toContainText('৳8,000')
  const shares = page.getByRole('region', { name: "Each owner's share" }).getByRole('row')
  await expect(shares).toHaveText([
    /Owner\s*Share/,
    /Emon\s*৳4,000/,
    /Rafi\s*৳2,400/,
    /Nila\s*৳1,600/,
  ])
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Expense deleted')).toBeVisible()
  await expect(page).toHaveURL('/expenses?month=2026-10')
  await expect(rows).toHaveCount(2)
  await expect(totals.getByRole('definition').first()).toHaveText('৳100')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows).toHaveCount(3)
  await expect(totals.getByRole('definition').first()).toHaveText('৳8,100')
})
