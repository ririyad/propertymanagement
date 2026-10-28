import { describe, expect, it } from 'vitest'
import { poisha } from '@/domain/money'
import type { Expense, ExpenseAllocation } from '@/domain/types'
import { countsInTotals, expenseTotals } from '@/domain/totals'

type E = Parameters<typeof expenseTotals>[0][number]
type A = Parameters<typeof expenseTotals>[1][number]

const expense = (id: string, amount: number, overrides: Partial<Expense> = {}): E => ({
  id,
  amount: poisha(amount),
  categoryId: 'caretaker',
  status: 'CONFIRMED',
  splitRule: 'BY_SHARE',
  deletedAt: null,
  ...overrides,
})

const allocation = (
  expenseId: string,
  ownerId: string,
  amount: number,
  overrides: Partial<ExpenseAllocation> = {},
): A => ({ expenseId, ownerId, amount: poisha(amount), deletedAt: null, ...overrides })

describe('expenseTotals (AGENT.md 10.2)', () => {
  it('adds confirmed expenses by category and their allocations by owner', () => {
    const totals = expenseTotals(
      [expense('e1', 800000), expense('e2', 10001, { categoryId: 'repairs' })],
      [
        allocation('e1', 'O1', 400000),
        allocation('e1', 'O2', 240000),
        allocation('e1', 'O3', 160000),
        allocation('e2', 'O1', 5001),
        allocation('e2', 'O2', 3000),
        allocation('e2', 'O3', 2000),
      ],
    )
    expect(totals.total).toBe(810001)
    expect(Object.fromEntries(totals.byCategory)).toEqual({ caretaker: 800000, repairs: 10001 })
    expect(Object.fromEntries(totals.byOwner)).toEqual({ O1: 405001, O2: 243000, O3: 162000 })
  })

  it('leaves out drafts, skipped, deleted and tenant-paid expenses and deleted allocations', () => {
    const totals = expenseTotals(
      [
        expense('draft', 100, { status: 'DRAFT' }),
        expense('skipped', 100, { status: 'SKIPPED' }),
        expense('deleted', 100, { deletedAt: 1 }),
        expense('tenant', 100, { splitRule: 'TENANT_PAID' }),
        expense('kept', 300),
      ],
      [
        allocation('draft', 'O1', 100),
        allocation('deleted', 'O1', 100),
        allocation('kept', 'O1', 200, { deletedAt: 1 }),
        allocation('kept', 'O1', 300),
      ],
    )
    expect(totals.total).toBe(300)
    expect(Object.fromEntries(totals.byOwner)).toEqual({ O1: 300 })
    expect(countsInTotals({ status: 'CONFIRMED', splitRule: 'TENANT_PAID', deletedAt: null })).toBe(
      false,
    )
  })

  it('totals nothing to zero', () => {
    expect(expenseTotals([], [])).toEqual({ total: 0, byCategory: new Map(), byOwner: new Map() })
  })
})
