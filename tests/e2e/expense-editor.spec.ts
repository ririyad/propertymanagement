import { expect, test } from '@playwright/test'
import { completeSetup, readTable } from './helpers'

test('adds an expense with a split override, a live preview and a photo', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Expenses' })
    .click()
  await page.getByRole('link', { name: 'Add expense' }).click()

  const preview = page.getByRole('region', { name: "Each owner's share" })
  const shares = preview.getByRole('definition')
  await expect(preview).toContainText('Enter an amount')
  await page.getByLabel('Amount (৳)').fill('8,000')
  await page.getByLabel('Category').selectOption({ label: 'Caretaker cost' })
  await expect(shares).toHaveText(['৳4,000', '৳2,400', '৳1,600'])
  await expect(page.getByLabel('Month')).toHaveValue('2026-10')
  await expect(page.getByLabel('Date')).toHaveValue('2026-10-15')

  // AGENT.md 17.1 S3.
  await page.getByLabel('Split').selectOption({ label: 'Equally between owners' })
  await page.getByLabel('Amount (৳)').fill('100')
  await expect(shares).toHaveText(['৳33.34', '৳33.33', '৳33.33'])

  await page.getByLabel('Split').selectOption({ label: 'Custom amounts' })
  await page.getByLabel('Emon (৳)').fill('70')
  await page.getByLabel('Rafi (৳)').fill('20')
  await expect(preview).toContainText('Owner amounts must add up to the total')
  await expect(preview).toContainText('Total ৳90 of ৳100')
  await page.getByLabel('Rafi (৳)').fill('30')
  await expect(shares).toHaveText(['৳70', '৳30'])

  await page.getByLabel('Split').selectOption({ label: 'By ownership share' })
  await page.getByLabel('Month').fill('2025-12')
  await expect(preview).toContainText('No ownership shares set for this building in December 2025')
  await page.getByLabel('Month').fill('2026-09')
  await page.getByLabel('Date').fill('2026-09-30')
  await page.getByLabel('Already paid').uncheck()
  await expect(page.getByText('Unpaid bills are listed under Bills to pay')).toBeVisible()

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 3200
    canvas.height = 2400
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#c33'
      context.fillRect(0, 0, 3200, 2400)
    }
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  })
  await page
    .getByLabel('Add photo')
    .setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  const thumbnail = page.getByRole('img', { name: 'Photo 1' })
  await expect(thumbnail).toBeVisible()
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1600)

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Expense saved')).toBeVisible()
  await expect(page).toHaveURL('/expenses?month=2026-09')

  const [expense] = await readTable<{ id: string }>(page, 'expense')
  expect(expense).toMatchObject({
    amount: 10000,
    period: '2026-09',
    date: '2026-09-30',
    isPaid: false,
    paidByOwnerId: null,
    splitRule: 'BY_SHARE',
    splitInputs: null,
    status: 'CONFIRMED',
    source: 'MANUAL',
  })
  const allocations = await readTable<{ amount: number }>(page, 'expenseAllocation')
  expect(allocations.map((a) => a.amount).sort((a, b) => b - a)).toEqual([5000, 3000, 2000])
  expect(await readTable(page, 'attachment')).toMatchObject([
    {
      recordType: 'EXPENSE',
      recordId: expense?.id,
      mimeType: 'image/jpeg',
      width: 1600,
      height: 1200,
      position: 0,
    },
  ])

  await page.goto(`/expenses/${expense?.id}/edit`)
  await expect(page.getByLabel('Amount (৳)')).toHaveValue('100')
  await expect(page.getByLabel('Category')).toHaveValue('system-caretaker')
  await expect(page.getByRole('img', { name: 'Photo 1' })).toBeVisible()
})
