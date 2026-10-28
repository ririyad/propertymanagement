import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/data/db'
import { newRecord } from '@/data/records'
import { listAllocations } from '@/data/repositories/expenses'
import { poisha } from '@/domain/money'
import { isoDate, period } from '@/domain/period'
import type { Expense } from '@/domain/types'
import { saveBuilding } from '@/services/buildings'
import {
  confirmDraft,
  deleteExpense,
  restoreExpense,
  saveExpense,
  skipDraft,
  type ExpenseInput,
} from '@/services/expenses'
import { saveMeter } from '@/services/meters'
import { saveShareSet } from '@/services/shares'
import { resetDb, seedBuildingA, seedSystemCategories, unwrap } from '@/test/db'

const today = isoDate('2026-10-15')

beforeEach(async () => {
  await resetDb()
  await seedSystemCategories()
})

async function setup() {
  const seeded = await seedBuildingA()
  // AGENT.md 17.3: caretaker ৳8,000 paid by O1, split by share.
  const caretaker: ExpenseInput = {
    buildingId: seeded.building.id,
    categoryId: 'system-caretaker',
    period: '2026-10',
    date: '2026-10-05',
    amount: poisha(800000),
    isPaid: true,
    paidByOwnerId: seeded.o1.id,
    splitRule: 'BY_SHARE',
  }
  return { ...seeded, caretaker }
}

async function allocated(expenseId: string) {
  const allocations = await listAllocations(expenseId)
  return Object.fromEntries(allocations.map((a) => [a.ownerId, a.amount]))
}

describe('saveExpense', () => {
  it('saves a manual expense as confirmed with allocations by share (17.1 S1)', async () => {
    const { o1, o2, o3, caretaker } = await setup()
    const expense = unwrap(await saveExpense(caretaker, today))
    expect(expense).toMatchObject({ status: 'CONFIRMED', source: 'MANUAL', templateId: null })
    expect(await allocated(expense.id)).toEqual({
      [o1.id]: 400000,
      [o2.id]: 240000,
      [o3.id]: 160000,
    })
  })

  it('validates the amount, month, payer and meter', async () => {
    const { caretaker } = await setup()
    expect(
      await saveExpense(
        { ...caretaker, amount: poisha(0), period: '2026-12', paidByOwnerId: null },
        today,
      ),
    ).toEqual({
      ok: false,
      errors: {
        amount: 'errors.expense.amountPositive',
        period: 'errors.period.tooFarAhead',
        paidByOwnerId: 'errors.expense.payerRequired',
      },
    })
    unwrap(await saveExpense({ ...caretaker, period: '2026-11' }, today))

    const other = unwrap(await saveBuilding({ name: 'Building B' }))
    const meter = unwrap(
      await saveMeter({
        buildingId: other.id,
        label: 'Main',
        type: 'POSTPAID',
        payer: 'OWNERS',
        categoryId: 'system-electricity',
        isActive: true,
      }),
    )
    expect(await saveExpense({ ...caretaker, meterId: meter.id }, today)).toEqual({
      ok: false,
      errors: { meterId: 'errors.expense.meterInvalid' },
    })
  })

  it('needs a share set only for splits by share or equally', async () => {
    const { o2, caretaker } = await setup()
    expect(await saveExpense({ ...caretaker, period: '2025-12' }, today)).toEqual({
      ok: false,
      errors: { splitRule: 'errors.shares.noneForPeriod' },
    })
    const single = unwrap(
      await saveExpense(
        { ...caretaker, period: '2025-12', splitRule: 'SINGLE_OWNER', singleOwnerId: o2.id },
        today,
      ),
    )
    expect(await allocated(single.id)).toEqual({ [o2.id]: 800000 })
  })

  it('keeps allocations when shares change later, and recomputes them on edit', async () => {
    const { o1, o2, o3, building, caretaker } = await setup()
    const expense = unwrap(await saveExpense(caretaker, today))
    unwrap(
      await saveShareSet({
        buildingId: building.id,
        effectiveFrom: period('2026-11'),
        entries: [
          { ownerId: o1.id, bp: 5000 },
          { ownerId: o2.id, bp: 5000 },
        ],
      }),
    )
    expect(await allocated(expense.id)).toEqual({
      [o1.id]: 400000,
      [o2.id]: 240000,
      [o3.id]: 160000,
    })

    unwrap(await saveExpense({ ...caretaker, id: expense.id, period: '2026-11' }, today))
    expect(await allocated(expense.id)).toEqual({ [o1.id]: 400000, [o2.id]: 400000 })
    expect(await db.expenseAllocation.where('expenseId').equals(expense.id).count()).toBe(5)
  })

  it('stores no allocations for a tenant-paid expense, nor for custom zeros', async () => {
    const { o1, o3, caretaker } = await setup()
    const tenant = unwrap(await saveExpense({ ...caretaker, splitRule: 'TENANT_PAID' }, today))
    expect(await listAllocations(tenant.id)).toEqual([])
    const custom = unwrap(
      await saveExpense(
        {
          ...caretaker,
          splitRule: 'CUSTOM_AMOUNT',
          splitInputs: [
            { ownerId: o1.id, value: 800000 },
            { ownerId: o3.id, value: 0 },
          ],
        },
        today,
      ),
    )
    expect(await allocated(custom.id)).toEqual({ [o1.id]: 800000 })
  })

  it('checks custom inputs', async () => {
    const { o1, o2, caretaker } = await setup()
    expect(
      await saveExpense(
        {
          ...caretaker,
          splitRule: 'CUSTOM_PERCENT',
          splitInputs: [
            { ownerId: o1.id, value: 6000 },
            { ownerId: o2.id, value: 3000 },
          ],
        },
        today,
      ),
    ).toEqual({ ok: false, errors: { splitInputs: 'errors.split.percentTotal' } })
  })
})

describe('drafts', () => {
  async function draft(buildingId: string) {
    const expense = newRecord<Expense>({
      buildingId,
      categoryId: 'system-caretaker',
      meterId: null,
      templateId: 'template',
      readingId: null,
      period: period('2026-10'),
      date: isoDate('2026-10-01'),
      dueDate: null,
      amount: poisha(800000),
      units: null,
      status: 'DRAFT',
      source: 'RECURRING',
      isPaid: false,
      paidByOwnerId: null,
      splitRule: 'BY_SHARE',
      singleOwnerId: null,
      splitInputs: null,
      note: null,
    })
    await db.expense.add(expense)
    return expense
  }

  it('creates allocations only when a draft is confirmed', async () => {
    const { building } = await setup()
    const expense = await draft(building.id)
    unwrap(await saveExpense({ ...expense, amount: poisha(900000) }, today))
    expect(await listAllocations(expense.id)).toEqual([])
    expect(unwrap(await confirmDraft(expense.id, today))).toMatchObject({
      status: 'CONFIRMED',
      amount: 900000,
    })
    expect(await listAllocations(expense.id)).toHaveLength(3)
    expect(await confirmDraft(expense.id, today)).toEqual({
      ok: false,
      errors: { expense: 'errors.expense.notDraft' },
    })
  })

  it('skips a draft without allocations', async () => {
    const { building } = await setup()
    const expense = await draft(building.id)
    expect(unwrap(await skipDraft(expense.id)).status).toBe('SKIPPED')
    expect(await listAllocations(expense.id)).toEqual([])
  })
})

describe('deleteExpense', () => {
  it('soft-deletes an expense with its allocations, and undo restores exactly those', async () => {
    const { caretaker, o2 } = await setup()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    const expense = unwrap(await saveExpense(caretaker, today))
    unwrap(
      await saveExpense(
        { ...caretaker, id: expense.id, splitRule: 'SINGLE_OWNER', singleOwnerId: o2.id },
        today,
      ),
    )
    const deleted = unwrap(await deleteExpense(expense.id))
    expect(await listAllocations(expense.id)).toEqual([])
    expect((await db.expense.get(expense.id))?.deletedAt).toBe(1_800_000_000_000)

    await restoreExpense(deleted)
    clock.mockRestore()
    expect(await allocated(expense.id)).toEqual({ [o2.id]: 800000 })
    expect((await db.expense.get(expense.id))?.deletedAt).toBe(null)
  })
})
