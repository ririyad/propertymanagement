import { add, poisha, type Poisha } from '@/domain/money'
import type { Expense, ExpenseAllocation } from '@/domain/types'

type CountedExpense = Pick<
  Expense,
  'id' | 'amount' | 'categoryId' | 'status' | 'splitRule' | 'deletedAt'
>
type CountedAllocation = Pick<ExpenseAllocation, 'expenseId' | 'ownerId' | 'amount' | 'deletedAt'>

/** Whether an expense counts in totals: confirmed, not deleted, not paid by a tenant (8.2, 8.3). */
export function countsInTotals(
  expense: Omit<CountedExpense, 'id' | 'amount' | 'categoryId'>,
): boolean {
  return (
    expense.status === 'CONFIRMED' &&
    expense.deletedAt === null &&
    expense.splitRule !== 'TENANT_PAID'
  )
}

export interface ExpenseTotals {
  total: Poisha
  byCategory: Map<string, Poisha>
  byOwner: Map<string, Poisha>
}

function addTo(map: Map<string, Poisha>, key: string, amount: Poisha) {
  map.set(key, add(map.get(key) ?? poisha(0), amount))
}

/**
 * The total of a set of expenses, by category and by owner (AGENT.md 10.2). Only expenses that
 * count in totals, and their live allocations, are added.
 */
export function expenseTotals(
  expenses: readonly CountedExpense[],
  allocations: readonly CountedAllocation[],
): ExpenseTotals {
  const totals: ExpenseTotals = { total: poisha(0), byCategory: new Map(), byOwner: new Map() }
  const counted = new Set<string>()
  for (const expense of expenses) {
    if (!countsInTotals(expense)) continue
    counted.add(expense.id)
    totals.total = add(totals.total, expense.amount)
    addTo(totals.byCategory, expense.categoryId, expense.amount)
  }
  for (const allocation of allocations)
    if (allocation.deletedAt === null && counted.has(allocation.expenseId))
      addTo(totals.byOwner, allocation.ownerId, allocation.amount)
  return totals
}
