import { expect, type Page } from '@playwright/test'

export interface SetupOptions {
  buildings?: string[]
  coOwners?: string[]
  /** Percent per owner (you first, then co-owners) for every building. */
  shares?: string[]
  /** Effective month of the shares, YYYY-MM. */
  sharesFrom?: string
}

async function nextStep(page: Page, heading: string): Promise<void> {
  await page.getByRole('button', { name: /^(Continue|Skip for now)$/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/** Walks the setup wizard from a fresh install (P1-T01). */
export async function completeSetup(page: Page, options: SetupOptions = {}): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'About you' })).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Emon')
  await nextStep(page, 'Your buildings')

  for (const building of options.buildings ?? []) {
    await page.getByLabel('Building name').fill(building)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('listitem').filter({ hasText: building })).toBeVisible()
  }
  await nextStep(page, 'Co-owners')

  for (const owner of options.coOwners ?? []) {
    await page.getByLabel('Name', { exact: true }).fill(owner)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('listitem').filter({ hasText: owner })).toBeVisible()
  }
  await nextStep(page, 'Ownership shares')

  if (options.shares) {
    for (const building of options.buildings ?? []) {
      const card = page.getByRole('region', { name: building })
      if (options.sharesFrom) await card.getByLabel('Effective from').fill(options.sharesFrom)
      for (const [i, percent] of options.shares.entries()) {
        await card.getByLabel('Share %').nth(i).fill(percent)
      }
      await card.getByRole('button', { name: 'Save' }).click()
      await expect(card.getByText(/Shares set from/)).toBeVisible()
    }
  }
  await nextStep(page, "You're all set")
  await page.getByRole('button', { name: 'Go to the dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
}

/** Reads every row of one of the app's IndexedDB tables, to check what a flow saved. */
export async function readTable<T>(page: Page, table: string): Promise<T[]> {
  const rows = await page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('property-ledger')
        open.onerror = () => reject(new Error(String(open.error)))
        open.onsuccess = () => {
          const request = open.result.transaction(name).objectStore(name).getAll()
          request.onsuccess = () => {
            resolve(request.result)
            open.result.close()
          }
          request.onerror = () => reject(new Error(String(request.error)))
        }
      }),
    table,
  )
  return rows as T[]
}
