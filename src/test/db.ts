import { db } from '@/data/db'
import { bp } from '@/domain/bp'
import { period } from '@/domain/period'
import { saveBuilding } from '@/services/buildings'
import { saveOwner } from '@/services/owners'
import { saveShareSet } from '@/services/shares'

/** Empties every table of the shared database between tests. */
export async function resetDb(): Promise<void> {
  await db.open()
  await Promise.all(db.tables.map((table) => table.clear()))
}

export function unwrap<T>(result: { ok: true; value: T } | { ok: false; errors: unknown }): T {
  if (!result.ok) throw new Error(`Expected ok, got ${JSON.stringify(result.errors)}`)
  return result.value
}

/** AGENT.md 17: owners O1 (primary), O2, O3 and Building A at 5000/3000/2000 bp from 2026-01. */
export async function seedBuildingA() {
  const o1 = unwrap(await saveOwner({ name: 'O1', isPrimary: true }))
  const o2 = unwrap(await saveOwner({ name: 'O2' }))
  const o3 = unwrap(await saveOwner({ name: 'O3' }))
  const building = unwrap(await saveBuilding({ name: 'Building A' }))
  const shareSet = unwrap(
    await saveShareSet({
      buildingId: building.id,
      effectiveFrom: period('2026-01'),
      entries: [
        { ownerId: o1.id, bp: bp(5000) },
        { ownerId: o2.id, bp: bp(3000) },
        { ownerId: o3.id, bp: bp(2000) },
      ],
    }),
  )
  return { o1, o2, o3, building, shareSet }
}
