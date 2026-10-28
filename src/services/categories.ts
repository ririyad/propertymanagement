import { db } from '@/data/db'
import { getMeta, setMeta } from '@/data/repositories/appMeta'
import type { CategoryKind, ExpenseCategory } from '@/domain/types'

/** The categories created on first launch (AGENT.md 7.7), with fixed ids so code can find them. */
export const SYSTEM_CATEGORIES = [
  { id: 'system-electricity', key: 'electricity', kind: 'METER' },
  { id: 'system-caretaker', key: 'caretaker', kind: 'RECURRING' },
  { id: 'system-service-charge', key: 'serviceCharge', kind: 'RECURRING' },
  { id: 'system-gas', key: 'gas', kind: 'RECURRING' },
  { id: 'system-holding-tax', key: 'holdingTax', kind: 'RECURRING' },
  { id: 'system-other-tax', key: 'otherTax', kind: 'RECURRING' },
  { id: 'system-repairs', key: 'repairs', kind: 'ONE_OFF' },
  { id: 'system-misc', key: 'misc', kind: 'ONE_OFF' },
] as const satisfies readonly { id: string; key: string; kind: CategoryKind }[]

export type SystemCategoryKey = (typeof SYSTEM_CATEGORIES)[number]['key']

export const ELECTRICITY_CATEGORY_ID = 'system-electricity'

/** Creates the system categories once. Names come from the caller, in the user's language. */
export async function seedCategories(names: Record<SystemCategoryKey, string>): Promise<void> {
  await db.transaction('rw', db.expenseCategory, db.appMeta, async () => {
    if (await getMeta('categoriesSeededAt')) return
    const now = Date.now()
    const existing = new Set(await db.expenseCategory.toCollection().primaryKeys())
    const rows: ExpenseCategory[] = SYSTEM_CATEGORIES.map((c, i) => ({
      id: c.id,
      name: names[c.key],
      kind: c.kind,
      defaultSplitRule: 'BY_SHARE',
      isSystem: true,
      isHidden: false,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }))
    await db.expenseCategory.bulkAdd(rows.filter((r) => !existing.has(r.id)))
    await setMeta('categoriesSeededAt', now)
  })
}
