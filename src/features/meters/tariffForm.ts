import { parsePercent } from '@/domain/bp'
import { parseTaka, poisha, ZERO, type Poisha } from '@/domain/money'
import type { Period } from '@/domain/period'
import { hasErrors, type Errors } from '@/domain/result'
import { validateTariff, type TariffRates } from '@/domain/tariff'
import type { SlabMode, Tariff, TariffMode } from '@/domain/types'
import { parseUnits } from '@/domain/units'
import { percentInputValue, takaInputValue } from '@/ui/format'

/** The tariff editor's values as typed. Rates are in taka per unit; the last slab is open-ended. */
export interface TariffFormValues {
  effectiveFrom: string
  mode: TariffMode
  flatRate: string
  slabMode: SlabMode
  slabs: { upTo: string; rate: string }[]
  fixedCharge: string
  vat: string
  vatOnFixed: boolean
}

export function tariffFormValues(
  tariff: Tariff | undefined,
  effectiveFrom: Period,
): TariffFormValues {
  const rate = (value: number) => takaInputValue(poisha(value))
  return {
    effectiveFrom,
    mode: tariff?.mode ?? 'FLAT',
    flatRate: tariff && tariff.flatRate !== null ? rate(tariff.flatRate) : '',
    slabMode: tariff?.slabMode ?? 'PROGRESSIVE',
    slabs:
      tariff && tariff.slabs.length > 0
        ? tariff.slabs.map((s) => ({
            upTo: s.upToUnits === null ? '' : String(s.upToUnits),
            rate: rate(s.rate),
          }))
        : [{ upTo: '', rate: '' }],
    fixedCharge: takaInputValue(tariff?.fixedChargeMonthly ?? ZERO),
    vat: percentInputValue(tariff?.vatBp ?? 0),
    vatOnFixed: tariff?.vatOnFixed ?? true,
  }
}

export type ParsedTariff = { ok: true; rates: TariffRates } | { ok: false; errors: Errors }

/** Reads the editor's values into tariff rates, with errors keyed like the tariff service's. */
export function parseTariffForm(values: TariffFormValues): ParsedTariff {
  const errors: Errors = {}
  const money = (key: string, text: string): Poisha => {
    const parsed = parseTaka(text)
    if (parsed.ok) return parsed.value
    errors[key] = parsed.error
    return ZERO
  }

  const isFlat = values.mode === 'FLAT'
  const flatRate = isFlat ? money('flatRate', values.flatRate) : null
  const slabs = isFlat
    ? []
    : values.slabs.map((slab, i) => {
        const rate = money(`slabs.${i}.rate`, slab.rate)
        if (i === values.slabs.length - 1) return { upToUnits: null, rate }
        const units = parseUnits(slab.upTo)
        if (!units.ok) errors[`slabs.${i}.upToUnits`] = units.error
        return { upToUnits: units.ok ? units.value : null, rate }
      })
  const fixedChargeMonthly = money('fixedChargeMonthly', values.fixedCharge)
  const vat = parsePercent(values.vat)
  if (!vat.ok) errors.vatBp = vat.error
  if (!vat.ok || hasErrors(errors)) return { ok: false, errors }

  const rates: TariffRates = {
    mode: values.mode,
    flatRate,
    slabMode: isFlat ? null : values.slabMode,
    slabs,
    fixedChargeMonthly,
    vatBp: vat.value,
    vatOnFixed: values.vatOnFixed,
  }
  const invalid = validateTariff(rates)
  return hasErrors(invalid) ? { ok: false, errors: invalid } : { ok: true, rates }
}
