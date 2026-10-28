import { beforeEach, describe, expect, it } from 'vitest'
import { listOwners } from '@/data/repositories/owners'
import { deleteOwner, saveOwner } from '@/services/owners'
import { resetDb, seedBuildingA, unwrap } from '@/test/db'

beforeEach(resetDb)

describe('saveOwner', () => {
  it('creates owners in order and trims optional text to null', async () => {
    const a = unwrap(await saveOwner({ name: '  Emon ', phone: ' ', isPrimary: true }))
    const b = unwrap(await saveOwner({ name: 'Rafi', relation: 'Brother' }))
    expect(a).toMatchObject({ name: 'Emon', phone: null, isPrimary: true, sortOrder: 0 })
    expect(b).toMatchObject({ relation: 'Brother', isPrimary: false, sortOrder: 1 })
  })

  it('keeps exactly one primary owner', async () => {
    const a = unwrap(await saveOwner({ name: 'A', isPrimary: true }))
    const b = unwrap(await saveOwner({ name: 'B', isPrimary: true }))
    const owners = await listOwners()
    expect(owners.filter((o) => o.isPrimary).map((o) => o.id)).toEqual([b.id])
    expect(owners.find((o) => o.id === a.id)?.isPrimary).toBe(false)
  })

  it('validates the name', async () => {
    expect(await saveOwner({ name: '  ' })).toEqual({
      ok: false,
      errors: { name: 'errors.owner.nameRequired' },
    })
    expect(await saveOwner({ name: 'x'.repeat(61) })).toEqual({
      ok: false,
      errors: { name: 'errors.owner.nameTooLong' },
    })
  })

  it('updates an existing owner', async () => {
    const owner = unwrap(await saveOwner({ name: 'A' }))
    const updated = unwrap(await saveOwner({ id: owner.id, name: 'Anwar', note: 'Elder' }))
    expect(updated).toMatchObject({ id: owner.id, name: 'Anwar', note: 'Elder', sortOrder: 0 })
    expect(await listOwners()).toHaveLength(1)
  })
})

describe('deleteOwner', () => {
  it('soft-deletes an owner without shares', async () => {
    const owner = unwrap(await saveOwner({ name: 'A' }))
    expect(unwrap(await deleteOwner(owner.id)).deletedAt).not.toBeNull()
    expect(await listOwners()).toEqual([])
  })

  it('refuses the primary owner and owners who hold shares', async () => {
    const { o1, o2 } = await seedBuildingA()
    expect(await deleteOwner(o1.id)).toEqual({
      ok: false,
      errors: { owner: 'errors.owner.primaryCannotBeDeleted' },
    })
    expect(await deleteOwner(o2.id)).toEqual({
      ok: false,
      errors: { owner: 'errors.owner.holdsShares' },
    })
  })
})
