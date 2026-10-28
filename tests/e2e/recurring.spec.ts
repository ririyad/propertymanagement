import { expect, test, type Page } from '@playwright/test'
import { completeSetup, readTable } from './helpers'

interface ExpenseRow {
  categoryId: string
  period: string
  amount: number
  status: string
  isPaid: boolean
}

interface TemplateRow {
  amount: number
}

async function addTemplate(page: Page, fields: Record<string, string>, paidBy?: string) {
  await page.getByRole('link', { name: 'Add recurring cost' }).first().click()
  await page.getByLabel('Category').selectOption({ label: fields.category ?? '' })
  await page.getByLabel('Amount (৳)').fill(fields.amount ?? '')
  await page.getByLabel('How often').selectOption({ label: fields.frequency ?? '' })
  await page.getByLabel('Due day').fill(fields.dueDay ?? '')
  await page.getByLabel('First month').fill(fields.start ?? '')
  if (paidBy) await page.getByLabel('Usually paid by').selectOption({ label: paidBy })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recurring costs in Building A')
}

test('creates drafts from recurring costs and confirms them', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })
  await page.goto('/buildings')
  await page.getByRole('link', { name: /Building A/ }).click()
  await expect(page.getByRole('link', { name: /Recurring costs/ })).toContainText(
    'No recurring costs yet',
  )
  await page.getByRole('link', { name: /Recurring costs/ }).click()

  await addTemplate(
    page,
    {
      category: 'Caretaker cost',
      amount: '8,000',
      frequency: 'Every month',
      dueDay: '5',
      start: '2026-09',
    },
    'Emon',
  )
  await page.getByRole('link', { name: 'Add recurring cost' }).click()
  await page.getByLabel('Amount (৳)').fill('100')
  await page.getByLabel('Due day').fill('31')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Choose a day from 1 to 28')).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await addTemplate(page, {
    category: 'Holding tax',
    amount: '12000',
    frequency: 'Every year',
    dueDay: '20',
    start: '2026-10',
  })
  await expect(page.getByRole('main').getByRole('listitem')).toHaveText([
    /Caretaker cost\s*৳8,000 · Every month · from September 2026/,
    /Holding tax\s*৳12,000 · Every year · from October 2026/,
  ])

  // The oldest month comes first.
  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByText('3 recurring costs to confirm')).toBeVisible()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Confirm this month')
  await expect(page.getByLabel('Month')).toHaveValue('2026-09')
  const caretaker = page.getByRole('group', { name: 'Caretaker cost' })
  await expect(caretaker).toContainText('Due 5 Sept 2026 · By ownership share')
  await expect(caretaker.getByLabel('Paid', { exact: true })).toBeChecked()
  await expect(caretaker.getByLabel('Paid by')).toHaveValue(/.+/)
  await caretaker.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Caretaker cost confirmed')).toBeVisible()
  await expect(page.getByText('Nothing to confirm for September 2026')).toBeVisible()

  // October: a new amount from now on, a skip undone, then confirm all.
  await page.getByLabel('Month').fill('2026-10')
  await caretaker.getByLabel('Amount (৳)').fill('8500')
  await caretaker.getByLabel('Also use this amount from now on').check()
  const tax = page.getByRole('group', { name: 'Holding tax' })
  await expect(tax.getByLabel('Paid', { exact: true })).not.toBeChecked()
  await tax.getByRole('button', { name: 'Skip' }).click()
  await expect(tax).toBeHidden()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(tax).toBeVisible()
  await page.getByRole('button', { name: 'Confirm all' }).click()
  await expect(page.getByText('2 costs confirmed')).toBeVisible()
  await expect(page.getByText('Nothing to confirm for October 2026')).toBeVisible()

  const expenses = await readTable<ExpenseRow>(page, 'expense')
  expect(
    expenses
      .map((e) => [e.categoryId, e.period, e.amount, e.status, e.isPaid])
      .sort(
        (a, b) =>
          String(a[1]).localeCompare(String(b[1])) || String(a[0]).localeCompare(String(b[0])),
      ),
  ).toEqual([
    ['system-caretaker', '2026-09', 800000, 'CONFIRMED', true],
    ['system-caretaker', '2026-10', 850000, 'CONFIRMED', true],
    ['system-holding-tax', '2026-10', 1200000, 'CONFIRMED', false],
  ])
  const templates = await readTable<TemplateRow>(page, 'recurringTemplate')
  expect(templates.map((t) => t.amount).sort()).toEqual([1200000, 850000])
})
