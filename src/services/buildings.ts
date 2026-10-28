import { db } from '@/data/db'
import { isLive, newRecord, optionalText, sameName } from '@/data/records'
import { findBuildingGroup, nextBuildingSortOrder } from '@/data/repositories/buildings'
import { fail, ok, type Result } from '@/domain/result'
import type { Building, BuildingGroup } from '@/domain/types'

export interface BuildingInput {
  id?: string
  name: string
  address?: string | null
  note?: string | null
  /** Optional group, found by name or created. */
  groupName?: string | null
}

export async function saveBuilding(input: BuildingInput): Promise<Result<Building>> {
  const name = input.name.trim()
  if (name === '') return fail({ name: 'errors.building.nameRequired' })

  return db.transaction('rw', [db.building, db.buildingGroup], async () => {
    const now = Date.now()
    const existing = input.id ? await db.building.get(input.id) : undefined
    if (input.id && (!existing || !isLive(existing)))
      return fail({ name: 'errors.common.notFound' })

    const buildings = (await db.building.toArray()).filter(isLive)
    if (buildings.some((b) => b.id !== input.id && sameName(b.name, name))) {
      return fail({ name: 'errors.building.nameTaken' })
    }

    let groupId: string | null = null
    const groupName = optionalText(input.groupName)
    if (groupName) {
      let group = await findBuildingGroup(groupName)
      if (!group) {
        group = newRecord<BuildingGroup>({ name: groupName }, now)
        await db.buildingGroup.add(group)
      }
      groupId = group.id
    }

    const fields = {
      name,
      address: optionalText(input.address),
      note: optionalText(input.note),
      groupId,
    }
    const building: Building = existing
      ? { ...existing, ...fields, updatedAt: now }
      : newRecord<Building>({ ...fields, sortOrder: await nextBuildingSortOrder() }, now)
    await db.building.put(building)
    return ok(building)
  })
}

/** Soft-deletes a building that has no meters, expenses or recurring costs. */
export async function deleteBuilding(id: string): Promise<Result<Building>> {
  return db.transaction(
    'rw',
    [db.building, db.meter, db.expense, db.recurringTemplate],
    async () => {
      const building = await db.building.get(id)
      if (!building || !isLive(building)) return fail({ building: 'errors.common.notFound' })

      const inUse = await Promise.all([
        db.meter.where('buildingId').equals(id).filter(isLive).count(),
        db.expense.where('[buildingId+period]').between([id, ''], [id, '￿']).filter(isLive).count(),
        db.recurringTemplate.where('buildingId').equals(id).filter(isLive).count(),
      ])
      if (inUse.some((n) => n > 0)) return fail({ building: 'errors.building.inUse' })

      const deleted = { ...building, deletedAt: Date.now(), updatedAt: Date.now() }
      await db.building.put(deleted)
      return ok(deleted)
    },
  )
}
