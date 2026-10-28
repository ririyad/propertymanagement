import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Period } from '@/domain/period'
import { fail, ok, type Result } from '@/domain/result'
import { shareSetFor } from '@/domain/shares'
import type { ShareOwner } from '@/domain/split'
import type { ShareEntry, ShareSet } from '@/domain/types'

/** A building's share sets, newest effective month first. */
export async function listShareSets(buildingId: string): Promise<ShareSet[]> {
  const sets = await db.shareSet.where('buildingId').equals(buildingId).toArray()
  return sets.filter(isLive).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

/** A share set's entries, in the owners' display order. */
export async function listShareEntries(shareSetId: string): Promise<ShareEntry[]> {
  const entries = (await db.shareEntry.where('shareSetId').equals(shareSetId).toArray()).filter(
    isLive,
  )
  const owners = await db.owner.bulkGet(entries.map((e) => e.ownerId))
  const order = new Map(owners.map((o, i) => [entries[i]?.id, o?.sortOrder]))
  const sortOrder = (e: ShareEntry) => order.get(e.id) ?? Number.MAX_SAFE_INTEGER
  return entries.sort((a, b) => sortOrder(a) - sortOrder(b))
}

export interface ResolvedShares {
  shareSet: ShareSet
  owners: ShareOwner[]
}

/** The owners and bp in force for a building and period (AGENT.md 8.1). */
export async function resolveShares(
  buildingId: string,
  period: Period,
): Promise<Result<ResolvedShares>> {
  const found = shareSetFor(await listShareSets(buildingId), buildingId, period)
  if (!found.ok) return found
  const entries = await listShareEntries(found.value.id)
  const owners = await db.owner.bulkGet(entries.map((e) => e.ownerId))
  const shareOwners = entries.map((entry, i) => ({
    ownerId: entry.ownerId,
    bp: entry.bp,
    sortOrder: owners[i]?.sortOrder ?? Number.MAX_SAFE_INTEGER,
  }))
  if (shareOwners.length === 0) return fail({ shareSet: 'errors.shares.noneForPeriod' })
  return ok({ shareSet: found.value, owners: shareOwners })
}
