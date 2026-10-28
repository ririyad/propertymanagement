import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Owner } from '@/domain/types'

export async function listOwners(): Promise<Owner[]> {
  return (await db.owner.orderBy('sortOrder').toArray()).filter(isLive)
}

/** Includes soft-deleted owners, so old records can still show a name. */
export async function getOwner(id: string): Promise<Owner | undefined> {
  return db.owner.get(id)
}

export async function getPrimaryOwner(): Promise<Owner | undefined> {
  return (await listOwners()).find((o) => o.isPrimary)
}

export async function nextOwnerSortOrder(): Promise<number> {
  const last = await db.owner.orderBy('sortOrder').last()
  return last ? last.sortOrder + 1 : 0
}
