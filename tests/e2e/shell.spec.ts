import { expect, test, type Page } from '@playwright/test'

const TABS = ['Dashboard', 'Expenses', 'Rent', 'Reports', 'More']

/** Fails the test on console errors, which include Content-Security-Policy violations. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
    )
  })
}

test('shows the five tabs and moves between them', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  const response = await page.goto('/')
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'")

  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveText(TABS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
  await expect(page).toHaveTitle('Dashboard · Property Ledger')

  for (const tab of TABS.slice(1)) {
    await nav.getByRole('link', { name: tab }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tab)
    await expect(nav.getByRole('link', { name: tab })).toHaveAttribute('aria-current', 'page')
  }
  await expect(page).toHaveURL('/more')

  await page.goBack()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports')
  expect(errors).toEqual([])
})

test('opens deep links and shows a not-found page for unknown paths', async ({ page }) => {
  await page.goto('/rent')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rent')

  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  await page.getByRole('link', { name: 'Go to the dashboard' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
})

test('works offline after the first visit, including a cold start', async ({ page, context }) => {
  const errors = collectConsoleErrors(page)
  await page.goto('/')
  await waitForServiceWorkerControl(page)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(TABS)

  const coldStart = await context.newPage()
  await coldStart.goto('/reports')
  await expect(coldStart.getByRole('heading', { level: 1 })).toHaveText('Reports')
  expect(errors).toEqual([])
})

test('serves a manifest that meets Chrome install criteria', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()

  const manifest = (await (await request.get(href ?? '')).json()) as {
    name: string
    short_name: string
    display: string
    start_url: string
    scope: string
    icons: { src: string; sizes: string; purpose?: string }[]
  }
  expect(manifest).toMatchObject({
    name: 'Property Ledger',
    display: 'standalone',
    start_url: '/',
    scope: '/',
  })
  const icon = (sizes: string, purpose: string) =>
    manifest.icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose)
  for (const found of [
    icon('192x192', 'any'),
    icon('512x512', 'any'),
    icon('512x512', 'maskable'),
  ]) {
    expect(found).toBeDefined()
    expect((await request.get(found?.src ?? '')).ok()).toBe(true)
  }
})
