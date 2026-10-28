import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { newRecord } from '@/data/records'
import { listMeters, listTariffs } from '@/data/repositories/meters'
import { bp } from '@/domain/bp'
import { poisha } from '@/domain/money'
import { isoDate, period } from '@/domain/period'
import type { MeterReading } from '@/domain/types'
import { saveBuilding } from '@/services/buildings'
import { ELECTRICITY_CATEGORY_ID } from '@/services/categories'
import {
  deleteMeter,
  deleteTariff,
  restoreMeter,
  restoreTariff,
  saveMeter,
  saveTariff,
  type MeterInput,
  type TariffInput,
} from '@/services/meters'
import { resetDb, seedBuildingA, seedSystemCategories, unwrap } from '@/test/db'

beforeEach(async () => {
  await resetDb()
  await seedSystemCategories()
})

async function setup() {
  const { building } = await seedBuildingA()
  const meter = (input: Partial<MeterInput> & { label: string }) =>
    saveMeter({
      buildingId: building.id,
      type: 'POSTPAID',
      payer: 'OWNERS',
      categoryId: ELECTRICITY_CATEGORY_ID,
      isActive: true,
      ...input,
    })
  return { building, meter }
}

/** AGENT.md 17.2 T2: four progressive slabs, a fixed charge and 5% VAT on everything. */
const slabTariff = (meterId: string): TariffInput => ({
  meterId,
  effectiveFrom: period('2026-10'),
  mode: 'SLAB',
  flatRate: null,
  slabMode: 'PROGRESSIVE',
  slabs: [
    { upToUnits: 75, rate: 500 },
    { upToUnits: 200, rate: 700 },
    { upToUnits: 300, rate: 750 },
    { upToUnits: null, rate: 800 },
  ],
  fixedChargeMonthly: poisha(8400),
  vatBp: bp(500),
  vatOnFixed: true,
})

function reading(meterId: string): MeterReading {
  return newRecord<MeterReading>({
    meterId,
    period: period('2026-10'),
    readingUnits: 12450,
    isReset: false,
    readOn: isoDate('2026-10-05'),
    unitsUsed: null,
    billAmount: null,
    billBreakdown: null,
  })
}

describe('saveMeter', () => {
  it('adds a meter common to the building (D38)', async () => {
    const { building, meter } = await setup()
    const saved = unwrap(await meter({ label: ' Main ', meterNo: ' 1234 ' }))
    expect(saved).toMatchObject({
      buildingId: building.id,
      label: 'Main',
      meterNo: '1234',
      scope: 'COMMON',
      flatId: null,
      parentMeterId: null,
      categoryId: ELECTRICITY_CATEGORY_ID,
    })
    expect(await listMeters(building.id)).toHaveLength(1)
  })

  it('requires a label that is unique within the building', async () => {
    const { meter } = await setup()
    expect(await meter({ label: ' ' })).toEqual({
      ok: false,
      errors: { label: 'errors.meter.labelRequired' },
    })
    unwrap(await meter({ label: 'Main' }))
    expect(await meter({ label: 'MAIN' })).toEqual({
      ok: false,
      errors: { label: 'errors.meter.labelTaken' },
    })
    const other = unwrap(await saveBuilding({ name: 'Building B' }))
    unwrap(await meter({ label: 'Main', buildingId: other.id }))
  })

  it('keeps a parent only on a sub meter, and only a main meter of the same building', async () => {
    const { meter } = await setup()
    const main = unwrap(await meter({ label: 'Main' }))
    const sub = unwrap(await meter({ label: 'Flat 1', type: 'SUB', parentMeterId: main.id }))
    expect(sub.parentMeterId).toBe(main.id)
    expect(unwrap(await meter({ label: 'Lift', parentMeterId: main.id })).parentMeterId).toBe(null)
    expect(await meter({ label: 'Flat 2', type: 'SUB', parentMeterId: sub.id })).toEqual({
      ok: false,
      errors: { parentMeterId: 'errors.meter.parentInvalid' },
    })
  })

  it('accepts only meter categories', async () => {
    const { meter } = await setup()
    expect(await meter({ label: 'Main', categoryId: 'system-caretaker' })).toEqual({
      ok: false,
      errors: { categoryId: 'errors.meter.categoryInvalid' },
    })
  })

  it('locks the type once the meter has readings, and of a meter with sub meters', async () => {
    const { meter } = await setup()
    const main = unwrap(await meter({ label: 'Main' }))
    unwrap(await meter({ label: 'Flat 1', type: 'SUB', parentMeterId: main.id }))
    expect(await meter({ id: main.id, label: 'Main', type: 'SUB' })).toEqual({
      ok: false,
      errors: { type: 'errors.meter.hasSubMeters' },
    })

    const flat2 = unwrap(await meter({ label: 'Flat 2', type: 'SUB' }))
    await db.meterReading.add(reading(flat2.id))
    expect(await meter({ id: flat2.id, label: 'Flat 2', type: 'PREPAID' })).toEqual({
      ok: false,
      errors: { type: 'errors.meter.typeLocked' },
    })
    unwrap(await meter({ id: flat2.id, label: 'Flat 2 (old)', type: 'SUB', isActive: false }))
  })
})

describe('deleteMeter', () => {
  it('soft-deletes a meter without records, with undo', async () => {
    const { building, meter } = await setup()
    const main = unwrap(await meter({ label: 'Main' }))
    unwrap(await deleteMeter(main.id))
    expect(await listMeters(building.id)).toEqual([])
    await restoreMeter(main.id)
    expect(await listMeters(building.id)).toHaveLength(1)
  })

  it('keeps a meter with sub meters or readings', async () => {
    const { meter } = await setup()
    const main = unwrap(await meter({ label: 'Main' }))
    const sub = unwrap(await meter({ label: 'Flat 1', type: 'SUB', parentMeterId: main.id }))
    expect(await deleteMeter(main.id)).toEqual({
      ok: false,
      errors: { meter: 'errors.meter.hasSubMeters' },
    })
    await db.meterReading.add(reading(sub.id))
    expect(await deleteMeter(sub.id)).toEqual({
      ok: false,
      errors: { meter: 'errors.meter.inUse' },
    })
  })
})

describe('saveTariff', () => {
  it('saves a slab tariff of a sub meter', async () => {
    const { meter } = await setup()
    const sub = unwrap(await meter({ label: 'Flat 1', type: 'SUB' }))
    const saved = unwrap(await saveTariff(slabTariff(sub.id)))
    expect(saved).toMatchObject({ ...slabTariff(sub.id), deletedAt: null })
    expect(await listTariffs(sub.id)).toHaveLength(1)
  })

  it('stores only the fields of the chosen mode', async () => {
    const { meter } = await setup()
    const sub = unwrap(await meter({ label: 'Flat 1', type: 'SUB' }))
    const saved = unwrap(await saveTariff({ ...slabTariff(sub.id), mode: 'FLAT', flatRate: 1000 }))
    expect(saved).toMatchObject({ mode: 'FLAT', flatRate: 1000, slabMode: null, slabs: [] })
  })

  it('validates the rates, the month and the meter', async () => {
    const { meter } = await setup()
    const sub = unwrap(await meter({ label: 'Flat 1', type: 'SUB' }))
    const main = unwrap(await meter({ label: 'Main' }))
    const slabs = [
      { upToUnits: 200, rate: 500 },
      { upToUnits: 100, rate: 700 },
      { upToUnits: null, rate: 800 },
    ]
    expect(await saveTariff({ ...slabTariff(sub.id), slabs })).toEqual({
      ok: false,
      errors: { 'slabs.1.upToUnits': 'errors.tariff.slabsIncreasing' },
    })
    expect(await saveTariff(slabTariff(main.id))).toEqual({
      ok: false,
      errors: { meterId: 'errors.tariff.subMeterOnly' },
    })
    unwrap(await saveTariff(slabTariff(sub.id)))
    expect(await saveTariff(slabTariff(sub.id))).toEqual({
      ok: false,
      errors: { effectiveFrom: 'errors.tariff.effectiveFromTaken' },
    })
  })

  it('soft-deletes a tariff, with undo', async () => {
    const { meter } = await setup()
    const sub = unwrap(await meter({ label: 'Flat 1', type: 'SUB' }))
    const saved = unwrap(await saveTariff(slabTariff(sub.id)))
    unwrap(await deleteTariff(saved.id))
    expect(await listTariffs(sub.id)).toEqual([])
    await restoreTariff(saved.id)
    expect(await listTariffs(sub.id)).toHaveLength(1)
  })
})
