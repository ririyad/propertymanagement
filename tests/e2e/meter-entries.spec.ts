import { expect, test, type Page } from '@playwright/test'
import { completeSetup, readTable } from './helpers'

async function addMeter(page: Page, label: string, type: string, payer = 'The owners') {
  await page.goto('/buildings')
  await page.getByRole('link', { name: /Building A/ }).click()
  await page.getByRole('link', { name: /Meters/ }).click()
  await page.getByRole('link', { name: 'Add meter' }).click()
  await page.getByLabel('Meter name').fill(label)
  await page.getByLabel('Type').selectOption({ label: type })
  await page.getByLabel('Who pays').selectOption({ label: payer })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
}

interface ExpenseRow {
  id: string
  meterId: string
}

test('records postpaid bills and prepaid recharges of a meter', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })

  await addMeter(page, 'Main', 'Postpaid')
  await expect(page.getByText('No bills yet')).toBeVisible()
  await page.getByRole('link', { name: 'Add bill' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New bill')
  await page.getByLabel('Bill month').fill('2026-09')
  await page.getByLabel('Amount (৳)').fill('2,030.70')
  await page.getByLabel('Due date (optional)').fill('2026-10-20')
  await page.getByLabel('Paid', { exact: true }).check()
  await page.getByLabel('Paid on').fill('2026-10-18')
  await expect(page.getByLabel('Paid by')).toHaveValue(/.+/)
  await page.getByLabel('Units on the bill (optional)').fill('280')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Bill saved')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Main')
  await expect(page.getByRole('link', { name: /September 2026/ })).toContainText(
    /Paid 18 Oct 2026\s*৳2,030\.70/,
  )

  await page.getByRole('link', { name: 'Add bill' }).click()
  await page.getByLabel('Bill month').fill('2026-09')
  await expect(page.getByText('This meter already has a bill for September 2026')).toBeVisible()
  await page.getByLabel('Bill month').fill('2026-10')
  await expect(page.getByText('This meter already has a bill')).toHaveCount(0)
  await page.getByLabel('Amount (৳)').fill('1500')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /October 2026/ })).toContainText('Not paid')

  await addMeter(page, 'Lift', 'Prepaid')
  await page.getByRole('link', { name: 'Add recharge' }).click()
  await expect(page.getByLabel('Recharge date')).toHaveValue('2026-10-15')
  await page.getByLabel('Recharge date').fill('2026-09-28')
  await page.getByLabel('Amount (৳)').fill('500')
  await page.getByLabel('Token number or note (optional)').fill('Token 1234')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /28 Sept? 2026/ })).toContainText('Token 1234')

  await addMeter(page, 'Flat 2 meter', 'Prepaid', 'The tenant')
  await page.getByRole('link', { name: 'Add recharge' }).click()
  await expect(page.getByText('The tenant pays this meter')).toBeVisible()
  await expect(page.getByLabel('Paid by')).toHaveCount(0)
  await page.getByLabel('Amount (৳)').fill('300')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Recharge saved')).toBeVisible()

  const expenses = await readTable<ExpenseRow>(page, 'expense')
  const meters = await readTable<{ id: string; label: string }>(page, 'meter')
  const meterId = (label: string) => meters.find((m) => m.label === label)?.id
  const of = (label: string) => expenses.filter((e) => e.meterId === meterId(label))
  expect(of('Main')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: 'METER_POSTPAID',
        period: '2026-09',
        date: '2026-10-18',
        dueDate: '2026-10-20',
        amount: 203070,
        units: 280,
        isPaid: true,
        status: 'CONFIRMED',
      }),
      expect.objectContaining({ period: '2026-10', isPaid: false, paidByOwnerId: null }),
    ]),
  )
  expect(of('Lift')).toMatchObject([
    { source: 'METER_PREPAID', period: '2026-09', amount: 50000, isPaid: true, note: 'Token 1234' },
  ])
  expect(of('Flat 2 meter')).toMatchObject([{ splitRule: 'TENANT_PAID', isPaid: false }])

  const allocations = await readTable<{ expenseId: string }>(page, 'expenseAllocation')
  const allocated = (expense?: ExpenseRow) =>
    allocations.filter((a) => a.expenseId === expense?.id).length
  expect(allocated(of('Lift')[0])).toBe(3)
  expect(allocated(of('Flat 2 meter')[0])).toBe(0)
})
