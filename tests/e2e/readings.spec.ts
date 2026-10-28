import { expect, test, type Page } from '@playwright/test'
import { completeSetup, readTable } from './helpers'

async function addMainMeter(page: Page, label: string) {
  await page.goto('/buildings')
  await page.getByRole('link', { name: /Building A/ }).click()
  await page.getByRole('link', { name: /^Meters/ }).click()
  await page.getByRole('link', { name: 'Add meter' }).click()
  await page.getByLabel('Meter name').fill(label)
  await page.getByLabel('Type').selectOption({ label: 'Postpaid' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
}

interface ExpenseRow {
  source: string
  period: string
  amount: number
  readingId: string | null
}

test('enters a month of sub-meter readings and bills them', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })
  await addMainMeter(page, 'Main')
  await page.getByRole('link', { name: 'Back' }).click()
  for (const [label, parent] of [
    ['Flat 1', null],
    ['Flat 2', 'Main'],
  ] as const) {
    await page.getByRole('link', { name: 'Add meter' }).click()
    await page.getByLabel('Meter name').fill(label)
    await page.getByLabel('Type').selectOption({ label: 'Sub meter' })
    if (parent) await page.getByLabel('Main meter').selectOption({ label: parent })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
    await page.getByRole('link', { name: 'Back' }).click()
  }

  // Flat 1 is billed at ৳10 a unit from September.
  await page.getByRole('link', { name: /^Flat 1/ }).click()
  await page.getByRole('link', { name: 'Add tariff' }).click()
  await page.getByLabel('Effective from').fill('2026-09')
  await page.getByLabel('Rate per unit (৳)').fill('10')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('No readings yet')).toBeVisible()

  // September's readings are the starting points.
  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('link', { name: /Meter readings/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meter readings')
  await expect(page.getByLabel('Month')).toHaveValue('2026-10')
  await page.getByLabel('Month').fill('2026-09')
  const flat1 = page.getByRole('group', { name: 'Flat 1', exact: true })
  const flat2 = page.getByRole('group', { name: 'Flat 2', exact: true })
  await expect(flat1).toContainText('First reading: it sets the starting point')
  await expect(flat2).toContainText("Reading only: Main's bill includes it")
  await flat1.getByLabel('Reading').fill('12,450')
  await expect(flat1.getByRole('status')).toHaveText('Starting point, no bill')
  await flat2.getByLabel('Reading').fill('500')
  await page.getByRole('button', { name: 'Save readings' }).click()
  await expect(page.getByText('Readings saved for September 2026')).toBeVisible()

  // October bills the units used since September.
  await page.getByLabel('Month').fill('2026-10')
  await expect(flat1).toContainText('Previous: 12,450 in September 2026')
  await flat1.getByLabel('Reading').fill('12400')
  await expect(flat1).toContainText('This reading is lower than the previous one')
  await flat1.getByLabel('Reading').fill('12730')
  await expect(flat1.getByRole('status')).toHaveText('280 units = ৳2,800')
  await flat2.getByLabel('Reading').fill('650')
  await expect(flat2).toContainText('Set up a tariff for this meter first')
  await page.getByRole('button', { name: 'Save readings' }).click()
  await expect(flat2).toContainText('Set up a tariff for this meter first')
  expect(await readTable(page, 'meterReading')).toHaveLength(2)

  // A meter reset starts again from the new reading.
  await flat2.getByLabel('Reading').fill('3')
  await flat2.getByLabel('Meter reset or replaced').check()
  await expect(flat2.getByRole('status')).toHaveText('Starting point, no bill')
  await page.getByRole('button', { name: 'Save readings' }).click()
  await expect(page.getByText('Readings saved for October 2026')).toBeVisible()

  const expenses = await readTable<ExpenseRow>(page, 'expense')
  expect(expenses).toMatchObject([{ source: 'METER_SUB', period: '2026-10', amount: 280000 }])
  await page.reload()
  await expect(flat1.getByLabel('Reading')).toHaveValue('12730')
  await expect(flat2.getByLabel('Meter reset or replaced')).toBeChecked()

  await page.getByRole('link', { name: 'Back' }).click()
  await page.getByRole('link', { name: /^Meters/ }).click()
  await page.getByRole('link', { name: /^Flat 1/ }).click()
  await expect(page.getByRole('region', { name: 'Readings' }).getByRole('listitem')).toHaveText([
    /October 2026\s*12,730 · 280 units\s*৳2,800/,
    /September 2026\s*12,450 · starting point/,
  ])
})
