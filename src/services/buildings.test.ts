import { beforeEach, describe, expect, it } from 'vitest'
import { listBuildingGroups, listBuildings } from '@/data/repositories/buildings'
import { deleteBuilding, saveBuilding } from '@/services/buildings'
import { resetDb, unwrap } from '@/test/db'

beforeEach(resetDb)

describe('saveBuilding', () => {
  it('needs a unique name, ignoring case', async () => {
    unwrap(await saveBuilding({ name: 'Building A' }))
    expect(await saveBuilding({ name: ' building a ' })).toEqual({
      ok: false,
      errors: { name: 'errors.building.nameTaken' },
    })
    expect(await saveBuilding({ name: '' })).toEqual({
      ok: false,
      errors: { name: 'errors.building.nameRequired' },
    })
  })

  it('finds or creates the group by name', async () => {
    const a = unwrap(await saveBuilding({ name: 'A', groupName: 'Mirpur' }))
    const b = unwrap(await saveBuilding({ name: 'B', groupName: 'mirpur' }))
    const c = unwrap(await saveBuilding({ name: 'C', groupName: '' }))
    expect(a.groupId).not.toBeNull()
    expect(b.groupId).toBe(a.groupId)
    expect(c.groupId).toBeNull()
    expect(await listBuildingGroups()).toHaveLength(1)
  })

  it('soft-deletes an unused building', async () => {
    const a = unwrap(await saveBuilding({ name: 'A' }))
    unwrap(await deleteBuilding(a.id))
    expect(await listBuildings()).toEqual([])
    unwrap(await saveBuilding({ name: 'A' }))
  })
})
