import { expect, test, type Page } from '@playwright/test'
import { completeSetup } from './helpers'

async function addMeter(page: Page, label: string, type: string, parent?: string) {
  await page.getByRole('link', { name: 'Add meter' }).click()
  await page.getByLabel('Meter name').fill(label)
  await page.getByLabel('Type').selectOption({ label: type })
  if (parent) await page.getByLabel('Main meter').selectOption({ label: parent })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(label)
}

test('adds meters and a slab tariff with a live bill preview', async ({ page }) => {
  const bill = page.getByRole('region', { name: 'Check a bill' }).getByRole('status')
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, { buildings: ['Building A'] })
  await page.goto('/buildings')
  await page.getByRole('link', { name: /Building A/ }).click()
  await expect(page.getByRole('link', { name: /Meters/ })).toContainText('No meters yet')
  await page.getByRole('link', { name: /Meters/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Meters in Building A')

  await addMeter(page, 'Main', 'Postpaid')
  await page.getByRole('link', { name: 'Back' }).click()
  await addMeter(page, 'Flat 1', 'Sub meter', 'Main')
  await expect(page.getByText('No tariff yet')).toBeVisible()

  // AGENT.md 17.2 T2 and T3.
  await page.getByRole('link', { name: 'Add tariff' }).click()
  await expect(page.getByLabel('Effective from')).toHaveValue('2026-10')
  await page.getByLabel('Pricing').selectOption({ label: 'Slabs' })
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add slab' }).click()
  const slabs = [
    ['75', '5'],
    ['200', '7'],
    ['300', '7.50'],
  ]
  for (const [i, [upTo, rate]] of slabs.entries()) {
    const slab = page.getByRole('group', { name: `Slab ${i + 1}` })
    await slab.getByLabel('Up to units').fill(upTo ?? '')
    await slab.getByLabel('Rate (৳)').fill(rate ?? '')
  }
  const last = page.getByRole('group', { name: 'Slab 4' })
  await expect(last).toContainText('Above 300 units')
  await last.getByLabel('Rate (৳)').fill('8')
  await page.getByLabel('Fixed monthly charge (৳)').fill('84')
  await page.getByLabel('VAT %').fill('5')
  await page.getByLabel('Units used').fill('280')
  await expect(bill).toContainText('280 units = ৳2,030.70')
  await page.getByLabel('How slabs are charged').selectOption('SINGLE_BAND')
  await expect(bill).toContainText('280 units = ৳2,293.20')
  await page.getByLabel('How slabs are charged').selectOption('PROGRESSIVE')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Flat 1')
  await expect(page.getByRole('link', { name: /From October 2026/ })).toContainText(
    '4 slabs · Each slab at its own rate · Fixed charge ৳84 · VAT 5%',
  )

  // A second sub meter starts from the first one's tariff.
  await page.getByRole('link', { name: 'Back' }).click()
  await addMeter(page, 'Flat 2', 'Sub meter', 'Main')
  await page.getByRole('link', { name: 'Add tariff' }).click()
  await expect(page.getByText('Rates copied from Flat 1')).toBeVisible()
  await page.getByLabel('Units used').fill('280')
  await expect(bill).toContainText('280 units = ৳2,030.70')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: /From October 2026/ })).toBeVisible()

  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page.getByRole('main').getByRole('listitem')).toHaveText([
    /^Main\s*Postpaid$/,
    /^Flat 1\s*Sub meter · Under Main$/,
    /^Flat 2\s*Sub meter · Under Main$/,
  ])
  await page.getByRole('link', { name: /^Main/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Sub meters sit under this meter')).toBeVisible()
})
