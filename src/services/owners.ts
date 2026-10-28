import { db } from '@/data/db'
import { isLive, newRecord, optionalText } from '@/data/records'
import { nextOwnerSortOrder } from '@/data/repositories/owners'
import { fail, ok, type Result } from '@/domain/result'
import type { Owner } from '@/domain/types'

export interface OwnerInput {
  id?: string
  name: string
  phone?: string | null
  relation?: string | null
  note?: string | null
  /** Making an owner primary removes primary from every other owner. */
  isPrimary?: boolean
}

export async function saveOwner(input: OwnerInput): Promise<Result<Owner>> {
  const name = input.name.trim()
  if (name === '') return fail({ name: 'errors.owner.nameRequired' })
  if (name.length > 60) return fail({ name: 'errors.owner.nameTooLong' })

  return db.transaction('rw', db.owner, async () => {
    const now = Date.now()
    const existing = input.id ? await db.owner.get(input.id) : undefined
    if (input.id && (!existing || !isLive(existing)))
      return fail({ name: 'errors.common.notFound' })

    const fields = {
      name,
      phone: optionalText(input.phone),
      relation: optionalText(input.relation),
      note: optionalText(input.note),
      isPrimary: input.isPrimary ?? existing?.isPrimary ?? false,
    }
    const owner: Owner = existing
      ? { ...existing, ...fields, updatedAt: now }
      : newRecord<Owner>({ ...fields, sortOrder: await nextOwnerSortOrder() }, now)

    if (owner.isPrimary) {
      const others = await db.owner.filter((o) => o.isPrimary && o.id !== owner.id).toArray()
      for (const other of others) await db.owner.put({ ...other, isPrimary: false, updatedAt: now })
    }
    await db.owner.put(owner)
    return ok(owner)
  })
}

/** Soft-deletes an owner who is not primary and holds no share in any building. */
export async function deleteOwner(id: string): Promise<Result<Owner>> {
  return db.transaction('rw', [db.owner, db.shareSet, db.shareEntry], async () => {
    const owner = await db.owner.get(id)
    if (!owner || !isLive(owner)) return fail({ owner: 'errors.common.notFound' })
    if (owner.isPrimary) return fail({ owner: 'errors.owner.primaryCannotBeDeleted' })

    const entries = (await db.shareEntry.where('ownerId').equals(id).toArray()).filter(isLive)
    const sets = await db.shareSet.bulkGet(entries.map((e) => e.shareSetId))
    if (sets.some((s) => s && isLive(s))) return fail({ owner: 'errors.owner.holdsShares' })

    const deleted = { ...owner, deletedAt: Date.now(), updatedAt: Date.now() }
    await db.owner.put(deleted)
    return ok(deleted)
  })
}

/** Undoes deleteOwner. */
export async function restoreOwner(id: string): Promise<void> {
  await db.owner.update(id, { deletedAt: null, updatedAt: Date.now() })
}
