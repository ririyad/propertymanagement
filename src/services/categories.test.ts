import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { newRecord } from '@/data/records'
import { listCategories } from '@/data/repositories/categories'
import { poisha } from '@/domain/money'
import { period } from '@/domain/period'
import type { RecurringTemplate } from '@/domain/types'
import {
  deleteCategory,
  moveCategory,
  restoreCategory,
  saveCategory,
  SYSTEM_CATEGORIES,
  seedCategories,
  type SystemCategoryKey,
} from '@/services/categories'
import { completeSetup, isSetupComplete } from '@/services/setup'
import { resetDb, seedBuildingA, unwrap } from '@/test/db'

beforeEach(resetDb)

const names = Object.fromEntries(SYSTEM_CATEGORIES.map((c) => [c.key, c.key])) as Record<
  SystemCategoryKey,
  string
>

describe('seedCategories', () => {
  it('creates the eight system categories once (AGENT.md 7.7)', async () => {
    await seedCategories(names)
    await seedCategories(names)
    const categories = await listCategories()
    expect(categories).toHaveLength(8)
    expect(categories[0]).toMatchObject({
      id: 'system-electricity',
      kind: 'METER',
      defaultSplitRule: 'BY_SHARE',
      isSystem: true,
    })
  })
})

describe('setup', () => {
  it('records completion', async () => {
    expect(await isSetupComplete()).toBe(false)
    await completeSetup()
    expect(await isSetupComplete()).toBe(true)
  })
})

const water = {
  name: 'Water',
  kind: 'ONE_OFF',
  defaultSplitRule: 'EQUAL',
  isHidden: false,
} as const

describe('saveCategory', () => {
  beforeEach(() => seedCategories(names))

  it('adds a category at the end of the list', async () => {
    const saved = unwrap(await saveCategory(water))
    expect(saved).toMatchObject({ ...water, isSystem: false, sortOrder: 8 })
    expect((await listCategories()).at(-1)?.id).toBe(saved.id)
  })

  it('requires a name that no other category uses', async () => {
    expect(await saveCategory({ ...water, name: '  ' })).toEqual({
      ok: false,
      errors: { name: 'errors.category.nameRequired' },
    })
    expect(await saveCategory({ ...water, name: ' ELECTRICITY ' })).toEqual({
      ok: false,
      errors: { name: 'errors.category.nameTaken' },
    })
  })

  it('allows only split rules that need no per-expense input (D41)', async () => {
    expect(await saveCategory({ ...water, defaultSplitRule: 'SINGLE_OWNER' })).toEqual({
      ok: false,
      errors: { defaultSplitRule: 'errors.category.splitRuleInvalid' },
    })
  })

  it('renames and hides a system category but keeps its kind', async () => {
    const saved = unwrap(
      await saveCategory({ ...water, id: 'system-gas', name: 'Gas bill', isHidden: true }),
    )
    expect(saved).toMatchObject({
      id: 'system-gas',
      name: 'Gas bill',
      kind: 'RECURRING',
      isSystem: true,
      isHidden: true,
      defaultSplitRule: 'EQUAL',
    })
  })
})

describe('moveCategory', () => {
  beforeEach(() => seedCategories(names))
  const order = async () => (await listCategories()).map((c) => c.id)

  it('swaps a category with its neighbour', async () => {
    await moveCategory('system-misc', -1)
    expect((await order()).slice(-2)).toEqual(['system-misc', 'system-repairs'])
    await moveCategory('system-electricity', 1)
    expect((await order()).slice(0, 2)).toEqual(['system-caretaker', 'system-electricity'])
  })

  it('ignores moves past either end', async () => {
    const before = await order()
    await moveCategory('system-electricity', -1)
    await moveCategory('system-misc', 1)
    expect(await order()).toEqual(before)
  })
})

describe('deleteCategory', () => {
  beforeEach(() => seedCategories(names))

  it('soft-deletes an unused category, with undo', async () => {
    const saved = unwrap(await saveCategory(water))
    unwrap(await deleteCategory(saved.id))
    expect((await listCategories()).map((c) => c.id)).not.toContain(saved.id)
    expect((await db.expenseCategory.get(saved.id))?.deletedAt).toBeTypeOf('number')
    await restoreCategory(saved.id)
    expect((await listCategories()).map((c) => c.id)).toContain(saved.id)
  })

  it('never deletes a system category', async () => {
    expect(await deleteCategory('system-misc')).toEqual({
      ok: false,
      errors: { category: 'errors.category.systemCannotBeDeleted' },
    })
  })

  it('keeps a category that is in use', async () => {
    const { building } = await seedBuildingA()
    const saved = unwrap(await saveCategory(water))
    await db.recurringTemplate.add(
      newRecord<RecurringTemplate>({
        buildingId: building.id,
        categoryId: saved.id,
        amount: poisha(50000),
        frequency: 'MONTHLY',
        startPeriod: period('2026-01'),
        endPeriod: null,
        dueDay: 1,
        defaultPaidByOwnerId: null,
        splitRule: 'BY_SHARE',
        isActive: 1,
        note: null,
      }),
    )
    expect(await deleteCategory(saved.id)).toEqual({
      ok: false,
      errors: { category: 'errors.category.inUse' },
    })
  })
})
