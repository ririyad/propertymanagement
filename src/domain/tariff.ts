// Sub-meter tariff calculation (AGENT.md 8.5) and tariff validation (8.10).
import { isBp } from '@/domain/bp'
import { add, mulInt, poisha, sum, ZERO, type Poisha } from '@/domain/money'
import type { Errors } from '@/domain/result'
import { percentHalfUp } from '@/domain/split'
import type { Tariff } from '@/domain/types'

export type TariffRates = Pick<
  Tariff,
  'mode' | 'flatRate' | 'slabMode' | 'slabs' | 'fixedChargeMonthly' | 'vatBp' | 'vatOnFixed'
>

export interface SlabCharge {
  /** Upper bound of the band, `null` when open-ended (and for a flat rate). */
  upToUnits: number | null
  units: number
  /** Poisha per unit. */
  rate: number
  amount: Poisha
}

export interface BillBreakdown {
  units: number
  lines: SlabCharge[]
  energy: Poisha
  fixed: Poisha
  vat: Poisha
  total: Poisha
}

function energyLines(tariff: TariffRates, units: number): SlabCharge[] {
  const line = (upToUnits: number | null, lineUnits: number, rate: number): SlabCharge => ({
    upToUnits,
    units: lineUnits,
    rate,
    amount: mulInt(poisha(rate), lineUnits),
  })

  if (tariff.mode === 'FLAT') {
    if (tariff.flatRate === null) throw new Error('A FLAT tariff needs flatRate')
    return [line(null, units, tariff.flatRate)]
  }

  const slabs = tariff.slabs
  if (tariff.slabMode === 'SINGLE_BAND') {
    const band = slabs.find((s) => s.upToUnits === null || s.upToUnits >= units) ?? slabs.at(-1)
    if (!band) throw new Error('A SLAB tariff needs slabs')
    return [line(band.upToUnits, units, band.rate)]
  }

  // PROGRESSIVE: each band charges the units that fall inside it at its own rate.
  const lines: SlabCharge[] = []
  let lowerBound = 0
  for (const slab of slabs) {
    if (lowerBound >= units) break
    const upper = slab.upToUnits === null ? units : Math.min(slab.upToUnits, units)
    lines.push(line(slab.upToUnits, upper - lowerBound, slab.rate))
    lowerBound = upper
  }
  if (lowerBound < units) throw new Error(`Tariff slabs do not cover ${units} units`)
  return lines
}

/** Turns units used into a bill: energy, plus the fixed charge, plus VAT rounded half-up. */
export function computeBill(tariff: TariffRates, units: number): BillBreakdown {
  if (!Number.isSafeInteger(units) || units < 0) {
    throw new RangeError(`Units must be a whole number of at least 0: ${units}`)
  }
  const lines = energyLines(tariff, units)
  const energy = sum(lines.map((l) => l.amount))
  const fixed = tariff.fixedChargeMonthly
  const base = add(energy, fixed)
  const vat = percentHalfUp(tariff.vatOnFixed ? base : energy, tariff.vatBp)
  return { units, lines, energy, fixed, vat, total: add(base, vat) }
}

function isRate(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0
}

/**
 * Checks a tariff before saving: a rate for `FLAT`; for `SLAB`, a slab mode and slabs whose
 * upper bounds strictly increase, with only the last one open-ended. Errors are i18n keys.
 */
export function validateTariff(tariff: TariffRates): Errors {
  const errors: Errors = {}

  if (tariff.mode === 'FLAT') {
    if (!isRate(tariff.flatRate)) errors.flatRate = 'errors.tariff.rateInvalid'
  } else {
    if (tariff.slabMode === null) errors.slabMode = 'errors.tariff.slabModeRequired'
    if (tariff.slabs.length === 0) errors.slabs = 'errors.tariff.slabsRequired'
    let previous = 0
    tariff.slabs.forEach((slab, i) => {
      const isLast = i === tariff.slabs.length - 1
      if (!isRate(slab.rate)) errors[`slabs.${i}.rate`] = 'errors.tariff.rateInvalid'
      if (slab.upToUnits === null) {
        if (!isLast) errors[`slabs.${i}.upToUnits`] = 'errors.tariff.lastSlabOpen'
      } else if (isLast) {
        errors[`slabs.${i}.upToUnits`] = 'errors.tariff.lastSlabOpen'
      } else if (!Number.isSafeInteger(slab.upToUnits) || slab.upToUnits <= previous) {
        errors[`slabs.${i}.upToUnits`] = 'errors.tariff.slabsIncreasing'
      } else {
        previous = slab.upToUnits
      }
    })
  }

  if (!Number.isSafeInteger(tariff.fixedChargeMonthly) || tariff.fixedChargeMonthly < ZERO) {
    errors.fixedChargeMonthly = 'errors.tariff.fixedChargeInvalid'
  }
  if (!isBp(tariff.vatBp)) errors.vatBp = 'errors.tariff.vatInvalid'
  return errors
}
