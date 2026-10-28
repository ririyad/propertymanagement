import { db } from '@/data/db'
import { isLive, newRecord, sameName } from '@/data/records'
import { getMeta, setMeta } from '@/data/repositories/appMeta'
import { listCategories } from '@/data/repositories/categories'
import { fail, hasErrors, ok, type Errors, type Result } from '@/domain/result'
import type { CategoryKind, ExpenseCategory, SplitRule } from '@/domain/types'

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

export const CATEGORY_KINDS = [
  'METER',
  'RECURRING',
  'ONE_OFF',
] as const satisfies readonly CategoryKind[]

/** A category can default only to rules that need no per-expense input (D41). */
export const CATEGORY_SPLIT_RULES = ['BY_SHARE', 'EQUAL'] as const satisfies readonly SplitRule[]

export interface CategoryInput {
  id?: string | undefined
  name: string
  kind: CategoryKind
  defaultSplitRule: SplitRule
  isHidden: boolean
}

/** Adds or edits a category. A system category keeps its kind (AGENT.md 7.4). */
export async function saveCategory(input: CategoryInput): Promise<Result<ExpenseCategory>> {
  const name = input.name.trim()
  const errors: Errors = {}
  if (name === '') errors.name = 'errors.category.nameRequired'
  if (!CATEGORY_KINDS.some((k) => k === input.kind)) errors.kind = 'errors.category.kindInvalid'
  if (!CATEGORY_SPLIT_RULES.some((r) => r === input.defaultSplitRule))
    errors.defaultSplitRule = 'errors.category.splitRuleInvalid'
  if (hasErrors(errors)) return fail(errors)

  return db.transaction('rw', db.expenseCategory, async () => {
    const now = Date.now()
    const existing = input.id ? await db.expenseCategory.get(input.id) : undefined
    if (input.id && (!existing || !isLive(existing)))
      return fail({ name: 'errors.common.notFound' })

    const categories = await listCategories()
    if (categories.some((c) => c.id !== input.id && sameName(c.name, name))) {
      return fail({ name: 'errors.category.nameTaken' })
    }

    const fields = {
      name,
      kind: existing?.isSystem ? existing.kind : input.kind,
      defaultSplitRule: input.defaultSplitRule,
      isHidden: input.isHidden,
    }
    const last = await db.expenseCategory.orderBy('sortOrder').last()
    const category: ExpenseCategory = existing
      ? { ...existing, ...fields, updatedAt: now }
      : newRecord<ExpenseCategory>(
          { ...fields, isSystem: false, sortOrder: (last?.sortOrder ?? -1) + 1 },
          now,
        )
    await db.expenseCategory.put(category)
    return ok(category)
  })
}

/** Moves a category one place up (-1) or down (1) in the list. */
export async function moveCategory(id: string, offset: -1 | 1): Promise<void> {
  await db.transaction('rw', db.expenseCategory, async () => {
    const categories = await listCategories()
    const from = categories.findIndex((c) => c.id === id)
    const to = from + offset
    const moved = categories[from]
    if (!moved || to < 0 || to >= categories.length) return
    categories.splice(from, 1)
    categories.splice(to, 0, moved)
    const now = Date.now()
    await db.expenseCategory.bulkPut(
      categories.flatMap((c, i) =>
        c.sortOrder === i ? [] : [{ ...c, sortOrder: i, updatedAt: now }],
      ),
    )
  })
}

/** Soft-deletes a category that is not built in and not used by an expense, meter or template. */
export async function deleteCategory(id: string): Promise<Result<ExpenseCategory>> {
  return db.transaction(
    'rw',
    [db.expenseCategory, db.expense, db.meter, db.recurringTemplate],
    async () => {
      const category = await db.expenseCategory.get(id)
      if (!category || !isLive(category)) return fail({ category: 'errors.common.notFound' })
      if (category.isSystem) return fail({ category: 'errors.category.systemCannotBeDeleted' })

      const inUse = await Promise.all([
        db.expense.where('categoryId').equals(id).filter(isLive).count(),
        db.meter.filter((m) => m.categoryId === id && isLive(m)).count(),
        db.recurringTemplate.filter((r) => r.categoryId === id && isLive(r)).count(),
      ])
      if (inUse.some((n) => n > 0)) return fail({ category: 'errors.category.inUse' })

      const now = Date.now()
      const deleted = { ...category, deletedAt: now, updatedAt: now }
      await db.expenseCategory.put(deleted)
      return ok(deleted)
    },
  )
}

/** Undoes deleteCategory. */
export async function restoreCategory(id: string): Promise<void> {
  await db.expenseCategory.update(id, { deletedAt: null, updatedAt: Date.now() })
}
