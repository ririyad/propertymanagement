import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Expense, RecurringTemplate } from '@/domain/types'

/** A building's recurring templates, active ones first, then by start month. */
export async function listTemplates(buildingId: string): Promise<RecurringTemplate[]> {
  const templates = await db.recurringTemplate.where('buildingId').equals(buildingId).toArray()
  return templates
    .filter(isLive)
    .sort((a, b) => b.isActive - a.isActive || a.startPeriod.localeCompare(b.startPeriod))
}

export async function getTemplate(id: string): Promise<RecurringTemplate | undefined> {
  return db.recurringTemplate.get(id)
}

/** Drafts waiting to be confirmed or skipped, oldest month and due date first (AGENT.md 8.6). */
export async function listDrafts(): Promise<Expense[]> {
  const drafts = await db.expense.where('status').equals('DRAFT').toArray()
  return drafts
    .filter(isLive)
    .sort((a, b) => a.period.localeCompare(b.period) || a.date.localeCompare(b.date))
}
