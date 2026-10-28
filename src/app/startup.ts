import i18n from '@/i18n'
import { seedCategories, SYSTEM_CATEGORIES, type SystemCategoryKey } from '@/services/categories'
import { runRollover } from '@/services/rollover'

/** Work done every time the app starts (AGENT.md 11.1). */
export async function runStartupTasks(): Promise<void> {
  const names = Object.fromEntries(
    SYSTEM_CATEGORIES.map((c) => [c.key, i18n.t(`seed.categories.${c.key}`)]),
  ) as Record<SystemCategoryKey, string>
  await seedCategories(names)
  await runRollover()
}

/** Runs the rollover again when the app comes back into view (AGENT.md 11.1). */
export function rolloverWhenVisible(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runRollover()
  })
}
