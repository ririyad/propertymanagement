import { expect, test } from '@playwright/test'
import { completeSetup } from './helpers'

test('keeps a dated history of share sets per building', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-15T06:00:00Z'))
  await completeSetup(page, {
    buildings: ['Building A'],
    coOwners: ['Rafi'],
    shares: ['60', '40'],
    sharesFrom: '2026-01',
  })
  await page.goto('/buildings')
  await page.getByRole('link', { name: /Building A/ }).click()
  const sharesLink = page.getByRole('link', { name: /Ownership shares/ })
  await expect(sharesLink).toContainText('From January 2026')
  await sharesLink.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shares in Building A')

  const january = page.getByRole('region', { name: 'From January 2026' })
  await expect(january).toContainText('In force now · Entered manually')
  await expect(january.getByRole('listitem')).toHaveText(['Emon60%', 'Rafi40%'])

  await page.getByRole('link', { name: 'New shares' }).click()
  await expect(page.getByLabel('Effective from')).toHaveValue('2026-10')
  await page.getByLabel('Share %').first().fill('50')
  await expect(page.getByText('10% left to assign')).toBeVisible()
  await page.getByLabel('Share %').nth(1).fill('50')
  await page.getByLabel('Effective from').fill('2026-11')
  await page.getByRole('button', { name: 'Save' }).click()

  const november = page.getByRole('region', { name: 'From November 2026' })
  await expect(november).toContainText('Starts later')
  await expect(november.getByRole('listitem')).toHaveText(['Emon50%', 'Rafi50%'])
  await expect(january).toContainText('In force now')

  await page.getByRole('link', { name: 'Edit shares from November 2026' }).click()
  await page.getByLabel('Effective from').fill('2026-01')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('This building already has shares starting this month')).toBeVisible()
  await page.getByLabel('Effective from').fill('2026-10')
  await page.getByRole('button', { name: 'Save' }).click()

  const october = page.getByRole('region', { name: 'From October 2026' })
  await expect(october).toContainText('In force now')
  await expect(january).toContainText('Earlier')

  await page.getByRole('button', { name: 'Delete shares from October 2026' }).click()
  await expect(october).toHaveCount(0)
  await expect(january).toContainText('In force now')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(october).toContainText('In force now')
  await expect(october.getByRole('listitem')).toHaveText(['Emon50%', 'Rafi50%'])
})
