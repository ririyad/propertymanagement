import { beforeEach, describe, expect, it } from 'vitest'
import { listAllocations, listMeterExpenses } from '@/data/repositories/expenses'
import { listReadings } from '@/data/repositories/readings'
import { bp } from '@/domain/bp'
import { poisha } from '@/domain/money'
import { isoDate, period } from '@/domain/period'
import type { MeterPayer } from '@/domain/types'
import { ELECTRICITY_CATEGORY_ID } from '@/services/categories'
import { saveExpense } from '@/services/expenses'
import { saveMeter, saveTariff, type TariffInput } from '@/services/meters'
import { saveReadings, type ReadingEntryInput } from '@/services/readings'
import { resetDb, seedBuildingA, seedSystemCategories, unwrap } from '@/test/db'

const today = isoDate('2026-10-15')

/** AGENT.md 17.2 T2. */
const slabTariff = (meterId: string): TariffInput => ({
  meterId,
  effectiveFrom: period('2026-01'),
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

const flatTariff = (meterId: string): TariffInput => ({
  ...slabTariff(meterId),
  mode: 'FLAT',
  flatRate: 1000,
  slabMode: null,
  slabs: [],
  fixedChargeMonthly: poisha(0),
  vatBp: bp(0),
})

async function allocated(expenseId: string) {
  const allocations = await listAllocations(expenseId)
  return Object.fromEntries(allocations.map((a) => [a.ownerId, a.amount]))
}

beforeEach(async () => {
  await resetDb()
  await seedSystemCategories()
})

async function setup({
  payer = 'OWNERS',
  parent = false,
}: { payer?: MeterPayer; parent?: boolean } = {}) {
  const seeded = await seedBuildingA()
  const meter = (label: string, type: 'POSTPAID' | 'SUB', parentMeterId: string | null = null) =>
    saveMeter({
      buildingId: seeded.building.id,
      label,
      type,
      payer: type === 'SUB' ? payer : 'OWNERS',
      parentMeterId,
      categoryId: ELECTRICITY_CATEGORY_ID,
      isActive: true,
    })
  const main = parent ? unwrap(await meter('Main', 'POSTPAID')) : null
  const sub = unwrap(await meter('Flat 1', 'SUB', main?.id ?? null))
  return { ...seeded, sub }
}

function save(
  buildingId: string,
  month: string,
  entries: ReadingEntryInput[],
  readOn = `${month}-28`,
) {
  return saveReadings({ buildingId, period: month, readOn, entries }, today)
}

describe('saveReadings (AGENT.md 8.4)', () => {
  it('stores the first reading as a baseline without a bill (17.2 T5)', async () => {
    const { building, sub } = await setup()
    unwrap(await saveTariff(slabTariff(sub.id)))
    const [first] = unwrap(
      await save(building.id, '2026-09', [
        { meterId: sub.id, readingUnits: 12450, isReset: false },
      ]),
    )
    expect(first).toMatchObject({
      period: '2026-09',
      readingUnits: 12450,
      unitsUsed: null,
      billAmount: null,
      billBreakdown: null,
    })
    expect(await listMeterExpenses(sub.id)).toEqual([])
  })

  it('bills the units since the previous reading as a confirmed expense split by share (17.2 T2)', async () => {
    const { building, sub, o1, o2, o3 } = await setup()
    unwrap(await saveTariff(slabTariff(sub.id)))
    unwrap(
      await save(building.id, '2026-09', [
        { meterId: sub.id, readingUnits: 12450, isReset: false },
      ]),
    )
    const [reading] = unwrap(
      await save(building.id, '2026-10', [
        { meterId: sub.id, readingUnits: 12730, isReset: false },
      ]),
    )
    expect(reading).toMatchObject({ unitsUsed: 280, billAmount: 203070, readOn: '2026-10-28' })
    expect(reading?.billBreakdown).toMatchObject({ energy: 185000, vat: 9670, total: 203070 })

    const [expense] = await listMeterExpenses(sub.id)
    expect(expense).toMatchObject({
      status: 'CONFIRMED',
      source: 'METER_SUB',
      readingId: reading?.id,
      period: '2026-10',
      date: '2026-10-28',
      amount: 203070,
      units: 280,
      isPaid: false,
      splitRule: 'BY_SHARE',
    })
    expect(await allocated(expense?.id ?? '')).toEqual({
      [o1.id]: 101535,
      [o2.id]: 60921,
      [o3.id]: 40614,
    })
  })

  it('blocks a reading lower than the previous one unless the meter was reset (17.2 T4)', async () => {
    const { building, sub } = await setup()
    unwrap(await saveTariff(flatTariff(sub.id)))
    unwrap(
      await save(building.id, '2026-09', [
        { meterId: sub.id, readingUnits: 12450, isReset: false },
      ]),
    )
    expect(
      await save(building.id, '2026-10', [
        { meterId: sub.id, readingUnits: 12400, isReset: false },
      ]),
    ).toEqual({
      ok: false,
      errors: { 'entries.0.readingUnits': 'errors.reading.lowerThanPrevious' },
    })

    const [reset] = unwrap(
      await save(building.id, '2026-10', [{ meterId: sub.id, readingUnits: 40, isReset: true }]),
    )
    expect(reset).toMatchObject({ isReset: true, unitsUsed: null, billAmount: null })
    expect(await listMeterExpenses(sub.id)).toEqual([])

    const [manual] = unwrap(
      await save(building.id, '2026-10', [
        { meterId: sub.id, readingUnits: 40, isReset: true, manualUnitsUsed: 90 },
      ]),
    )
    expect(manual).toMatchObject({ id: reset?.id, unitsUsed: 90, billAmount: 90000 })
    expect(await listMeterExpenses(sub.id)).toMatchObject([{ amount: 90000, readingId: reset?.id }])
  })

  it('saves the whole batch or nothing', async () => {
    const { building, sub } = await setup()
    unwrap(await saveTariff(flatTariff(sub.id)))
    const other = unwrap(
      await saveMeter({
        buildingId: building.id,
        label: 'Flat 2',
        type: 'SUB',
        payer: 'OWNERS',
        categoryId: ELECTRICITY_CATEGORY_ID,
        isActive: true,
      }),
    )
    expect(
      await save(building.id, '2026-10', [
        { meterId: sub.id, readingUnits: 100, isReset: false },
        { meterId: other.id, readingUnits: -1, isReset: false },
      ]),
    ).toEqual({ ok: false, errors: { 'entries.1.readingUnits': 'errors.reading.invalidUnits' } })
    expect(await listReadings(sub.id)).toEqual([])
  })

  it('asks for a tariff before billing a reading', async () => {
    const { building, sub } = await setup()
    unwrap(
      await save(building.id, '2026-09', [{ meterId: sub.id, readingUnits: 100, isReset: false }]),
    )
    expect(
      await save(building.id, '2026-10', [{ meterId: sub.id, readingUnits: 200, isReset: false }]),
    ).toEqual({ ok: false, errors: { 'entries.0.tariff': 'errors.reading.noTariff' } })
  })

  it.each([
    ['under a main meter', { parent: true }],
    ['paid by the tenant', { payer: 'TENANT' as const }],
  ])('creates no expense for a sub meter %s', async (_, options) => {
    const { building, sub } = await setup(options)
    unwrap(await saveTariff(flatTariff(sub.id)))
    unwrap(
      await save(building.id, '2026-09', [{ meterId: sub.id, readingUnits: 100, isReset: false }]),
    )
    const [reading] = unwrap(
      await save(building.id, '2026-10', [{ meterId: sub.id, readingUnits: 250, isReset: false }]),
    )
    expect(reading).toMatchObject({ unitsUsed: 150, billAmount: 150000 })
    expect(await listMeterExpenses(sub.id)).toEqual([])
  })

  it('bills the next reading again when a reading is edited (rule 7)', async () => {
    const { building, sub, o1, o2, o3 } = await setup()
    unwrap(await saveTariff(flatTariff(sub.id)))
    for (const [month, units] of [
      ['2026-08', 12000],
      ['2026-09', 12450],
      ['2026-10', 12730],
    ] as const)
      unwrap(
        await save(building.id, month, [{ meterId: sub.id, readingUnits: units, isReset: false }]),
      )
    const before = await listMeterExpenses(sub.id)
    expect(before.map((e) => [e.period, e.amount])).toEqual([
      ['2026-10', 280000],
      ['2026-09', 450000],
    ])
    // The payer set on October's bill survives the recomputation.
    const october = before[0]!
    unwrap(await saveExpense({ ...october, isPaid: true, paidByOwnerId: o1.id }, today))

    unwrap(
      await save(building.id, '2026-09', [
        { meterId: sub.id, readingUnits: 12500, isReset: false },
      ]),
    )
    expect((await listReadings(sub.id)).map((r) => [r.period, r.unitsUsed, r.billAmount])).toEqual([
      ['2026-08', null, null],
      ['2026-09', 500, 500000],
      ['2026-10', 230, 230000],
    ])
    const after = await listMeterExpenses(sub.id)
    expect(after.map((e) => [e.id, e.amount, e.isPaid, e.paidByOwnerId])).toEqual([
      [october.id, 230000, true, o1.id],
      [before[1]?.id, 500000, false, null],
    ])
    expect(await allocated(october.id)).toEqual({ [o1.id]: 115000, [o2.id]: 69000, [o3.id]: 46000 })

    expect(
      await save(building.id, '2026-09', [
        { meterId: sub.id, readingUnits: 12800, isReset: false },
      ]),
    ).toEqual({ ok: false, errors: { 'entries.0.readingUnits': 'errors.reading.higherThanNext' } })
  })

  it('checks the month and the meter', async () => {
    const { building, sub } = await setup()
    expect(
      await save(building.id, '2026-12', [{ meterId: sub.id, readingUnits: 1, isReset: false }]),
    ).toEqual({ ok: false, errors: { period: 'errors.period.tooFarAhead' } })
    expect(
      await save('elsewhere', '2026-10', [{ meterId: sub.id, readingUnits: 1, isReset: false }]),
    ).toEqual({ ok: false, errors: { 'entries.0.readingUnits': 'errors.common.notFound' } })
  })
})
