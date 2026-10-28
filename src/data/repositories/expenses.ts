import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Expense, ExpenseAllocation } from '@/domain/types'

/** Includes soft-deleted expenses. */
export async function getExpense(id: string): Promise<Expense | undefined> {
  return db.expense.get(id)
}

/** An expense's stored owner allocations. */
export async function listAllocations(expenseId: string): Promise<ExpenseAllocation[]> {
  return (await db.expenseAllocation.where('expenseId').equals(expenseId).toArray()).filter(isLive)
}
