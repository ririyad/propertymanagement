import { describe, expect, it } from 'vitest'
import { bp } from '@/domain/bp'
import { poisha, ZERO } from '@/domain/money'
import { computeReading, type PriorReading } from '@/domain/meterBill'
import { period } from '@/domain/period'
import type { TariffRates } from '@/domain/tariff'

const flatTariff: TariffRates & { effectiveFrom: ReturnType<typeof period> } = {
  effectiveFrom: period('2026-01'),
  mode: 'FLAT',
  flatRate: 1000,
  slabMode: null,
  slabs: [],
  fixedChargeMonthly: ZERO,
  vatBp: bp(0),
  vatOnFixed: true,
}

const slabTariff = {
  ...flatTariff,
  mode: 'SLAB' as const,
  flatRate: null,
  slabMode: 'PROGRESSIVE' as const,
  slabs: [
    { upToUnits: 75, rate: 500 },
    { upToUnits: 200, rate: 700 },
    { upToUnits: 300, rate: 750 },
    { upToUnits: null, rate: 800 },
  ],
  fixedChargeMonthly: poisha(8400),
  vatBp: bp(500),
}

const september: PriorReading = { period: period('2026-09'), readingUnits: 12450, unitsUsed: 300 }

describe('AGENT.md 17.2 reading rules', () => {
  it('bills 280 units from 12,450 to 12,730', () => {
    const result = computeReading(
      { period: period('2026-10'), readingUnits: 12730, isReset: false },
      [september],
      [slabTariff],
    )
    expect(result).toMatchObject({
      ok: true,
      value: { kind: 'BILL', unitsUsed: 280, monthsCovered: 1, bill: { total: 203070 } },
    })
  })

  it('T4: blocks a reading lower than the previous one without reset', () => {
    expect(
      computeReading(
        { period: period('2026-10'), readingUnits: 12400, isReset: false },
        [september],
        [slabTariff],
      ),
    ).toEqual({ ok: false, errors: { readingUnits: 'errors.reading.lowerThanPrevious' } })
  })

  it('T5: the first reading is a baseline with no bill', () => {
    expect(
      computeReading({ period: period('2026-10'), readingUnits: 12730, isReset: false }, [], []),
    ).toEqual({ ok: true, value: { kind: 'BASELINE' } })
  })
})

describe('computeReading', () => {
  const october = { period: period('2026-10'), readingUnits: 12730, isReset: false }

  it('uses the latest earlier reading and ignores later ones', () => {
    const history: PriorReading[] = [
      { period: period('2026-08'), readingUnits: 12000, unitsUsed: null },
      september,
      { period: period('2026-11'), readingUnits: 13000, unitsUsed: 270 },
    ]
    const result = computeReading(october, history, [flatTariff])
    expect(result.ok && result.value.kind === 'BILL' && result.value.previous).toBe(september)
  })

  it('covers skipped months', () => {
    const result = computeReading(
      october,
      [{ period: period('2026-07'), readingUnits: 12000, unitsUsed: null }],
      [flatTariff],
    )
    expect(result).toMatchObject({ ok: true, value: { unitsUsed: 730, monthsCovered: 3 } })
  })

  it('treats a reset reading as a new baseline', () => {
    expect(
      computeReading(
        { period: period('2026-10'), readingUnits: 15, isReset: true },
        [september],
        [flatTariff],
      ),
    ).toEqual({ ok: true, value: { kind: 'BASELINE' } })
  })

  it('bills a reset reading when units used are entered by hand', () => {
    const result = computeReading(
      { period: period('2026-10'), readingUnits: 15, isReset: true, manualUnitsUsed: 120 },
      [september],
      [flatTariff],
    )
    expect(result).toMatchObject({ ok: true, value: { unitsUsed: 120, bill: { total: 120000 } } })
  })

  it('blocks a bill without a tariff in force', () => {
    expect(
      computeReading(october, [september], [{ ...flatTariff, effectiveFrom: period('2026-11') }]),
    ).toEqual({ ok: false, errors: { tariff: 'errors.reading.noTariff' } })
  })

  it('uses the tariff in force for the reading period', () => {
    const later = { ...flatTariff, effectiveFrom: period('2026-10'), flatRate: 2000 }
    const result = computeReading(october, [september], [flatTariff, later])
    expect(result).toMatchObject({ ok: true, value: { bill: { total: 560000 } } })
  })

  it('rejects readings that are not whole units', () => {
    for (const readingUnits of [-1, 12.5]) {
      expect(computeReading({ ...october, readingUnits }, [september], [flatTariff])).toEqual({
        ok: false,
        errors: { readingUnits: 'errors.reading.invalidUnits' },
      })
    }
  })

  it('warns when usage is more than 3 times the average of the last 3 bills', () => {
    const history: PriorReading[] = [
      { period: period('2026-05'), readingUnits: 10000, unitsUsed: 5000 }, // older than the last 3
      { period: period('2026-06'), readingUnits: 10100, unitsUsed: 100 },
      { period: period('2026-07'), readingUnits: 10200, unitsUsed: 100 },
      { period: period('2026-08'), readingUnits: 10300, unitsUsed: null }, // baseline, not a bill
      { period: period('2026-09'), readingUnits: 10400, unitsUsed: 100 },
    ]
    const at = (readingUnits: number) => {
      const result = computeReading({ ...october, readingUnits }, history, [flatTariff])
      return result.ok && result.value.kind === 'BILL' && result.value.highUsage
    }
    expect(at(10700)).toBe(false) // 300 = 3 × average
    expect(at(10701)).toBe(true) // 301 > 3 × average
  })

  it('does not warn without earlier bills', () => {
    const result = computeReading(
      { ...october, readingUnits: 99999 },
      [{ period: period('2026-09'), readingUnits: 0, unitsUsed: null }],
      [flatTariff],
    )
    expect(result).toMatchObject({ ok: true, value: { highUsage: false } })
  })
})
