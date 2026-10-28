import { describe, expect, it } from 'vitest'
import { newRecord } from '@/data/records'
import { bp } from '@/domain/bp'
import { poisha } from '@/domain/money'
import { period } from '@/domain/period'
import { computeBill } from '@/domain/tariff'
import type { Tariff } from '@/domain/types'
import { parseTariffForm, tariffFormValues, type TariffFormValues } from './tariffForm'

/** AGENT.md 17.2 T2 as the user types it. */
const t2: TariffFormValues = {
  effectiveFrom: '2026-10',
  mode: 'SLAB',
  flatRate: '',
  slabMode: 'PROGRESSIVE',
  slabs: [
    { upTo: '75', rate: '5' },
    { upTo: '200', rate: '7' },
    { upTo: '300', rate: '7.50' },
    { upTo: '', rate: '8' },
  ],
  fixedCharge: '84',
  vat: '5',
  vatOnFixed: true,
}

function rates(values: TariffFormValues) {
  const parsed = parseTariffForm(values)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors))
  return parsed.rates
}

describe('parseTariffForm', () => {
  it('reads taka rates as poisha per unit (17.2 T2 and T3)', () => {
    expect(rates(t2)).toMatchObject({
      flatRate: null,
      slabs: [
        { upToUnits: 75, rate: 500 },
        { upToUnits: 200, rate: 700 },
        { upToUnits: 300, rate: 750 },
        { upToUnits: null, rate: 800 },
      ],
      fixedChargeMonthly: 8400,
      vatBp: 500,
    })
    expect(computeBill(rates(t2), 280).total).toBe(203070)
    expect(computeBill(rates({ ...t2, slabMode: 'SINGLE_BAND' }), 280).total).toBe(229320)
  })

  it('reads a flat rate and ignores the slabs (17.2 T1)', () => {
    const flat = rates({ ...t2, mode: 'FLAT', flatRate: '10', fixedCharge: '0', vat: '0' })
    expect(flat).toMatchObject({ flatRate: 1000, slabMode: null, slabs: [] })
    expect(computeBill(flat, 280).total).toBe(280000)
  })

  it('reports errors under the service field names', () => {
    expect(
      parseTariffForm({
        ...t2,
        slabs: [
          { upTo: '', rate: '5' },
          { upTo: '', rate: 'x' },
        ],
        vat: '101',
      }),
    ).toEqual({
      ok: false,
      errors: {
        'slabs.0.upToUnits': 'errors.units.required',
        'slabs.1.rate': 'errors.money.invalid',
        vatBp: 'errors.percent.outOfRange',
      },
    })
    expect(
      parseTariffForm({
        ...t2,
        slabs: [
          { upTo: '200', rate: '5' },
          { upTo: '100', rate: '6' },
          { upTo: '', rate: '7' },
        ],
      }),
    ).toEqual({ ok: false, errors: { 'slabs.1.upToUnits': 'errors.tariff.slabsIncreasing' } })
  })

  it('round-trips a saved tariff', () => {
    const tariff = newRecord<Tariff>({
      meterId: 'm',
      effectiveFrom: period('2026-10'),
      ...rates(t2),
      fixedChargeMonthly: poisha(8450),
      vatBp: bp(750),
    })
    expect(rates(tariffFormValues(tariff, tariff.effectiveFrom))).toMatchObject({
      slabs: tariff.slabs,
      fixedChargeMonthly: 8450,
      vatBp: 750,
    })
  })
})
