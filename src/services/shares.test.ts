import { beforeEach, describe, expect, it } from 'vitest'
import { listShareEntries, listShareSets, resolveShares } from '@/data/repositories/shares'
import { period } from '@/domain/period'
import { deleteShareSet, saveShareSet } from '@/services/shares'
import { resetDb, seedBuildingA, unwrap } from '@/test/db'

beforeEach(resetDb)

describe('share sets', () => {
  it('resolves owners and bp in force, ordered by sortOrder', async () => {
    const { o1, o2, o3, building } = await seedBuildingA()
    const resolved = unwrap(await resolveShares(building.id, period('2026-10')))
    expect(resolved.owners).toEqual([
      { ownerId: o1.id, bp: 5000, sortOrder: 0 },
      { ownerId: o2.id, bp: 3000, sortOrder: 1 },
      { ownerId: o3.id, bp: 2000, sortOrder: 2 },
    ])
    expect(await resolveShares(building.id, period('2025-12'))).toEqual({
      ok: false,
      errors: { shareSet: 'errors.shares.noneForPeriod' },
    })
  })

  it('applies a new set only from its effective month', async () => {
    const { o1, o2, building } = await seedBuildingA()
    unwrap(
      await saveShareSet({
        buildingId: building.id,
        effectiveFrom: period('2026-11'),
        entries: [
          { ownerId: o1.id, bp: 6000 },
          { ownerId: o2.id, bp: 4000 },
        ],
      }),
    )
    expect(unwrap(await resolveShares(building.id, period('2026-10'))).owners).toHaveLength(3)
    expect(unwrap(await resolveShares(building.id, period('2026-11'))).owners).toHaveLength(2)
  })

  it('validates entries and a unique effective month', async () => {
    const { o1, building } = await seedBuildingA()
    expect(
      await saveShareSet({
        buildingId: building.id,
        effectiveFrom: period('2026-02'),
        entries: [{ ownerId: o1.id, bp: 9000 }],
      }),
    ).toEqual({ ok: false, errors: { entries: 'errors.shares.totalNot100' } })
    expect(
      await saveShareSet({
        buildingId: building.id,
        effectiveFrom: period('2026-01'),
        entries: [{ ownerId: o1.id, bp: 10000 }],
      }),
    ).toEqual({ ok: false, errors: { effectiveFrom: 'errors.shares.effectiveFromTaken' } })
  })

  it('replaces entries when editing, and soft-deletes', async () => {
    const { o1, building, shareSet } = await seedBuildingA()
    unwrap(
      await saveShareSet({
        id: shareSet.id,
        buildingId: building.id,
        effectiveFrom: period('2026-01'),
        entries: [{ ownerId: o1.id, bp: 10000 }],
      }),
    )
    expect(await listShareEntries(shareSet.id)).toMatchObject([{ ownerId: o1.id, bp: 10000 }])

    unwrap(await deleteShareSet(shareSet.id))
    expect(await listShareSets(building.id)).toEqual([])
    expect(await listShareEntries(shareSet.id)).toEqual([])
  })
})
