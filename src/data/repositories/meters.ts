import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Meter, Tariff } from '@/domain/types'

const labelOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** A building's meters, by label ("Flat 2" before "Flat 10"). */
export async function listMeters(buildingId: string): Promise<Meter[]> {
  return (await db.meter.where('buildingId').equals(buildingId).toArray())
    .filter(isLive)
    .sort((a, b) => labelOrder.compare(a.label, b.label))
}

export async function getMeter(id: string): Promise<Meter | undefined> {
  return db.meter.get(id)
}

/** A meter's tariffs, newest effective month first. */
export async function listTariffs(meterId: string): Promise<Tariff[]> {
  const tariffs = await db.tariff.where('meterId').equals(meterId).toArray()
  return tariffs.filter(isLive).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

/** The most recently saved tariff of another sub meter in the building, to start a new one from. */
export async function latestSiblingTariff(
  meter: Meter,
): Promise<{ meter: Meter; tariff: Tariff } | undefined> {
  let latest: { meter: Meter; tariff: Tariff } | undefined
  for (const sibling of await listMeters(meter.buildingId)) {
    if (sibling.type !== 'SUB' || sibling.id === meter.id) continue
    for (const tariff of await listTariffs(sibling.id)) {
      if (!latest || tariff.updatedAt > latest.tariff.updatedAt) latest = { meter: sibling, tariff }
    }
  }
  return latest
}
