import { devices, expect, test, type Page } from '@playwright/test'
import { completeSetup } from './helpers'

/** Headless Chromium may offer Web Share; without it the file downloads, which a test can catch. */
async function withoutWebShare(page: Page) {
  await page.addInitScript(() => {
    const prototype = Navigator.prototype as unknown as Record<string, unknown>
    delete prototype.share
    delete prototype.canShare
  })
}

test('saves a backup file and restores it into a fresh install', async ({ page, browser }) => {
  await withoutWebShare(page)
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi', 'Nila'],
    shares: ['50', '30', '20'],
    sharesFrom: '2026-01',
  })
  await page.goto('/expenses/new')
  await page.getByLabel('Amount (৳)').fill('8,000')
  await page.getByLabel('Category').selectOption({ label: 'Caretaker cost' })
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Expense saved')).toBeVisible()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: /Backup file/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backup file')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save backup file' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('PropertyLedger_Backup_2026-10-15_1200.json.gz')
  await expect(page.getByText('Backup file saved')).toBeVisible()
  const file = await download.path()

  // A new phone: a fresh profile restores from the first setup step.
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: test.info().project.use.baseURL,
  })
  const fresh = await context.newPage()
  await fresh.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await fresh.goto('/')
  await expect(fresh.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible()
  await fresh.getByRole('link', { name: 'Restore from a backup file' }).click()
  await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Backup file')

  await fresh.getByLabel('Choose backup file').setInputFiles({
    name: 'notes.json.gz',
    mimeType: 'application/gzip',
    buffer: Buffer.from('not a backup'),
  })
  await expect(fresh.getByText('This file is not a Property Ledger backup')).toBeVisible()
  await fresh.getByLabel('Choose backup file').setInputFiles(file)
  const chosen = fresh.getByRole('region', { name: 'Chosen backup' })
  await expect(chosen).toContainText('Backup from 15 Oct 2026, 12:00')
  await expect(chosen).toContainText('3 owners · 1 building · 1 expense · 0 readings · no photos')
  await chosen.getByRole('button', { name: 'Replace and restore' }).click()
  await expect(fresh.getByText('Backup restored')).toBeVisible()
  await expect(fresh.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
  await expect(fresh.getByRole('main')).toContainText('Expenses in October 2026৳8,000')
  await context.close()
})
