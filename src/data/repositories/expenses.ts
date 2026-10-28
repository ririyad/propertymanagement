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

/** A meter's expenses (bills or recharges), newest first. */
export async function listMeterExpenses(meterId: string): Promise<Expense[]> {
  const expenses = await db.expense.where('meterId').equals(meterId).toArray()
  return expenses
    .filter((e) => isLive(e) && e.status !== 'SKIPPED')
    .sort((a, b) => b.period.localeCompare(a.period) || b.date.localeCompare(a.date))
}

/**
 * A month's confirmed expenses, of one building or all, newest date first (AGENT.md section 9).
 * Drafts wait on "Confirm this month" and skipped ones are left out.
 */
export async function listMonthExpenses(period: string, buildingId?: string): Promise<Expense[]> {
  const expenses = buildingId
    ? await db.expense.where('[buildingId+period]').equals([buildingId, period]).toArray()
    : await db.expense.where('period').equals(period).toArray()
  return expenses
    .filter((e) => isLive(e) && e.status === 'CONFIRMED')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

/** The live allocations of several expenses. */
export async function listAllocationsOf(
  expenseIds: readonly string[],
): Promise<ExpenseAllocation[]> {
  return (await db.expenseAllocation.where('expenseId').anyOf(expenseIds).toArray()).filter(isLive)
}
