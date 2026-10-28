// Owner allocations of an expense (AGENT.md 8.3), built on the split engine (8.2).
import { ok, type Result } from '@/domain/result'
import { applySplitRule, type OwnerAmount, type ShareOwner, type SplitOwner } from '@/domain/split'
import type { Expense } from '@/domain/types'

export type ExpenseSplit = Pick<Expense, 'amount' | 'splitRule' | 'singleOwnerId' | 'splitInputs'>

export interface AllocationContext {
  /** The share set in force for the expense's building and period; empty if there is none. */
  shares: readonly ShareOwner[]
  /** Every owner, for the sort order that breaks rounding ties of custom splits. */
  owners: readonly SplitOwner[]
}

/**
 * The allocations to store for an expense: one per owner with a non-zero amount (D37), summing
 * exactly to the amount. A tenant-paid expense has none. Errors are i18n keys.
 */
export function allocateExpense(
  expense: ExpenseSplit,
  { shares, owners }: AllocationContext,
): Result<OwnerAmount[]> {
  const sortOrder = new Map(owners.map((o) => [o.ownerId, o.sortOrder]))
  const result = applySplitRule({
    amount: expense.amount,
    rule: expense.splitRule,
    shares,
    singleOwnerId: expense.singleOwnerId,
    inputs: expense.splitInputs?.map((input) => ({
      ...input,
      sortOrder: sortOrder.get(input.ownerId) ?? Number.MAX_SAFE_INTEGER,
    })),
  })
  if (!result.ok) return result
  return ok(result.value.filter((a) => a.amount !== 0))
}

/** Whether a split rule divides by the building's shares, so the period needs a share set. */
export function needsShares(rule: Expense['splitRule']): boolean {
  return rule === 'BY_SHARE' || rule === 'EQUAL'
}
