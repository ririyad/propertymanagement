import { describe, expect, it } from 'vitest'
import { bp } from '@/domain/bp'
import { poisha, ZERO } from '@/domain/money'
import { computeBill, validateTariff, type TariffRates } from '@/domain/tariff'

// AGENT.md 17.2: previous reading 12,450, current 12,730, units used 280.
// The slab rates are illustrative test values, not official tariffs.
const UNITS = 280

const flat: TariffRates = {
  mode: 'FLAT',
  flatRate: 1000,
  slabMode: null,
  slabs: [],
  fixedChargeMonthly: ZERO,
  vatBp: bp(0),
  vatOnFixed: true,
}

const slabs: TariffRates = {
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
}

describe('AGENT.md 17.2 sub-meter bills', () => {
  it('T1: flat 1000 poisha per unit, no fixed charge, no VAT', () => {
    const bill = computeBill(flat, UNITS)
    expect(bill.total).toBe(280000)
    expect(bill.lines).toEqual([{ upToUnits: null, units: 280, rate: 1000, amount: 280000 }])
  })

  it('T2: progressive slabs with fixed charge and VAT on the fixed charge too', () => {
    expect(computeBill(slabs, UNITS)).toEqual({
      units: 280,
      lines: [
        { upToUnits: 75, units: 75, rate: 500, amount: 37500 },
        { upToUnits: 200, units: 125, rate: 700, amount: 87500 },
        { upToUnits: 300, units: 80, rate: 750, amount: 60000 },
      ],
      energy: 185000,
      fixed: 8400,
      vat: 9670,
      total: 203070,
    })
  })

  it('T3: single band', () => {
    const bill = computeBill({ ...slabs, slabMode: 'SINGLE_BAND' }, UNITS)
    expect(bill).toMatchObject({ energy: 210000, fixed: 8400, vat: 10920, total: 229320 })
    expect(bill.lines).toEqual([{ upToUnits: 300, units: 280, rate: 750, amount: 210000 }])
  })
})

describe('computeBill', () => {
  it('charges VAT on energy only when vatOnFixed is off', () => {
    expect(computeBill({ ...slabs, vatOnFixed: false }, UNITS)).toMatchObject({
      energy: 185000,
      vat: 9250,
      total: 202650,
    })
  })

  it('uses the open-ended slab above the last bound', () => {
    const bill = computeBill(slabs, 310)
    expect(bill.lines.at(-1)).toEqual({ upToUnits: null, units: 10, rate: 800, amount: 8000 })
    expect(bill.energy).toBe(37500 + 87500 + 75000 + 8000)
    expect(computeBill({ ...slabs, slabMode: 'SINGLE_BAND' }, 310).energy).toBe(310 * 800)
  })

  it('charges exactly the slab boundary to that slab', () => {
    expect(computeBill(slabs, 75).lines).toEqual([
      { upToUnits: 75, units: 75, rate: 500, amount: 37500 },
    ])
    expect(computeBill({ ...slabs, slabMode: 'SINGLE_BAND' }, 200).energy).toBe(200 * 700)
  })

  it('bills zero units as the fixed charge plus VAT', () => {
    expect(computeBill(slabs, 0)).toMatchObject({ lines: [], energy: 0, vat: 420, total: 8820 })
  })

  it('rejects negative and fractional units', () => {
    expect(() => computeBill(flat, -1)).toThrow(RangeError)
    expect(() => computeBill(flat, 1.5)).toThrow(RangeError)
  })
})

describe('validateTariff', () => {
  it('accepts valid tariffs', () => {
    expect(validateTariff(flat)).toEqual({})
    expect(validateTariff(slabs)).toEqual({})
  })

  it('needs a rate for a flat tariff', () => {
    expect(validateTariff({ ...flat, flatRate: null })).toEqual({
      flatRate: 'errors.tariff.rateInvalid',
    })
  })

  it('needs slabs and a slab mode', () => {
    expect(validateTariff({ ...slabs, slabMode: null, slabs: [] })).toEqual({
      slabMode: 'errors.tariff.slabModeRequired',
      slabs: 'errors.tariff.slabsRequired',
    })
  })

  it('needs strictly increasing bounds', () => {
    expect(
      validateTariff({
        ...slabs,
        slabs: [
          { upToUnits: 100, rate: 500 },
          { upToUnits: 100, rate: 700 },
          { upToUnits: null, rate: 800 },
        ],
      }),
    ).toEqual({ 'slabs.1.upToUnits': 'errors.tariff.slabsIncreasing' })
  })

  it('needs only the last slab to be open-ended', () => {
    expect(
      validateTariff({
        ...slabs,
        slabs: [
          { upToUnits: null, rate: 500 },
          { upToUnits: 200, rate: 700 },
        ],
      }),
    ).toEqual({
      'slabs.0.upToUnits': 'errors.tariff.lastSlabOpen',
      'slabs.1.upToUnits': 'errors.tariff.lastSlabOpen',
    })
  })

  it('checks the fixed charge, VAT and rates', () => {
    expect(
      validateTariff({
        ...flat,
        flatRate: 7.5,
        fixedChargeMonthly: -1 as typeof flat.fixedChargeMonthly,
        vatBp: 10001 as typeof flat.vatBp,
      }),
    ).toEqual({
      flatRate: 'errors.tariff.rateInvalid',
      fixedChargeMonthly: 'errors.tariff.fixedChargeInvalid',
      vatBp: 'errors.tariff.vatInvalid',
    })
  })
})
