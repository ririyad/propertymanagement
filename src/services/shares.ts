import { db } from '@/data/db'
import { isLive, newRecord, optionalText } from '@/data/records'
import { bp } from '@/domain/bp'
import type { Period } from '@/domain/period'
import { fail, hasErrors, ok, type Result } from '@/domain/result'
import { validateShareEntries } from '@/domain/shares'
import type { ShareEntry, ShareSet } from '@/domain/types'

export interface ShareSetInput {
  id?: string
  buildingId: string
  effectiveFrom: Period
  methodNote?: string | null
  entries: { ownerId: string; bp: number }[]
}

/**
 * Saves a manual share set (AGENT.md 8.1). Editing replaces its entries. Allocations already
 * stored are never recomputed (AGENT.md 0.2 rule 6).
 */
export async function saveShareSet(input: ShareSetInput): Promise<Result<ShareSet>> {
  const errors = validateShareEntries(input.entries)
  if (hasErrors(errors)) return fail(errors)

  return db.transaction('rw', [db.building, db.owner, db.shareSet, db.shareEntry], async () => {
    const now = Date.now()
    const building = await db.building.get(input.buildingId)
    if (!building || !isLive(building)) return fail({ buildingId: 'errors.common.notFound' })

    const owners = await db.owner.bulkGet(input.entries.map((e) => e.ownerId))
    const ownerErrors: Record<string, string> = {}
    owners.forEach((owner, i) => {
      if (!owner || !isLive(owner))
        ownerErrors[`entries.${i}.ownerId`] = 'errors.shares.ownerRequired'
    })
    if (hasErrors(ownerErrors)) return fail(ownerErrors)

    const existing = input.id ? await db.shareSet.get(input.id) : undefined
    if (input.id && (!existing || !isLive(existing)))
      return fail({ shareSet: 'errors.common.notFound' })

    const sameMonth = await db.shareSet
      .where('[buildingId+effectiveFrom]')
      .equals([input.buildingId, input.effectiveFrom])
      .filter((s) => isLive(s) && s.id !== input.id)
      .count()
    if (sameMonth > 0) return fail({ effectiveFrom: 'errors.shares.effectiveFromTaken' })

    const fields = {
      buildingId: input.buildingId,
      effectiveFrom: input.effectiveFrom,
      method: 'MANUAL' as const,
      methodNote: optionalText(input.methodNote),
    }
    const shareSet: ShareSet = existing
      ? { ...existing, ...fields, updatedAt: now }
      : newRecord<ShareSet>(fields, now)
    await db.shareSet.put(shareSet)

    if (existing) {
      const old = (await db.shareEntry.where('shareSetId').equals(shareSet.id).toArray()).filter(
        isLive,
      )
      await db.shareEntry.bulkPut(old.map((e) => ({ ...e, deletedAt: now, updatedAt: now })))
    }
    await db.shareEntry.bulkAdd(
      input.entries.map((e) =>
        newRecord<ShareEntry>({ shareSetId: shareSet.id, ownerId: e.ownerId, bp: bp(e.bp) }, now),
      ),
    )
    return ok(shareSet)
  })
}

export async function deleteShareSet(id: string): Promise<Result<ShareSet>> {
  return db.transaction('rw', [db.shareSet, db.shareEntry], async () => {
    const shareSet = await db.shareSet.get(id)
    if (!shareSet || !isLive(shareSet)) return fail({ shareSet: 'errors.common.notFound' })
    const now = Date.now()
    const entries = (await db.shareEntry.where('shareSetId').equals(id).toArray()).filter(isLive)
    await db.shareEntry.bulkPut(entries.map((e) => ({ ...e, deletedAt: now, updatedAt: now })))
    const deleted = { ...shareSet, deletedAt: now, updatedAt: now }
    await db.shareSet.put(deleted)
    return ok(deleted)
  })
}
