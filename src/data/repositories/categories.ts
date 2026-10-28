import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { ExpenseCategory } from '@/domain/types'

export async function listCategories(): Promise<ExpenseCategory[]> {
  return (await db.expenseCategory.orderBy('sortOrder').toArray()).filter(isLive)
}

export async function getCategory(id: string): Promise<ExpenseCategory | undefined> {
  return db.expenseCategory.get(id)
}
