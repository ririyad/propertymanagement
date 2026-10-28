import type { TFunction } from 'i18next'
import { poisha } from '@/domain/money'
import type { Meter, Tariff } from '@/domain/types'
import { formatBp, formatTaka } from '@/ui/format'

/** One line about a meter for lists: type, main meter, payer, number and whether it is in use. */
export function meterDetail(t: TFunction, meter: Meter, meters: Meter[]): string {
  const parent = meters.find((m) => m.id === meter.parentMeterId)
  return [
    t(`meter.types.${meter.type}`),
    parent && t('meter.underParent', { parent: parent.label }),
    meter.payer === 'TENANT' && t('meter.tenantPays'),
    meter.meterNo,
    !meter.isActive && t('meter.inactive'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** One line about a tariff: its rate or slabs, the fixed charge and VAT. */
export function tariffSummary(t: TFunction, tariff: Tariff): string {
  const rates =
    tariff.mode === 'FLAT'
      ? [t('tariff.summaryFlat', { rate: formatTaka(poisha(tariff.flatRate ?? 0)) })]
      : [
          t('tariff.summarySlabs', { count: tariff.slabs.length }),
          t(`tariff.slabModes.${tariff.slabMode ?? 'PROGRESSIVE'}`),
        ]
  return [
    ...rates,
    tariff.fixedChargeMonthly > 0 &&
      `${t('tariff.fixedLine')} ${formatTaka(tariff.fixedChargeMonthly)}`,
    tariff.vatBp > 0 && `${t('tariff.vatLine')} ${formatBp(tariff.vatBp)}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Meters in list order: each main meter followed by the sub meters under it. */
export function underParents(meters: Meter[]): Meter[] {
  const isUnder = (m: Meter) => meters.some((p) => p.id === m.parentMeterId)
  return meters
    .filter((m) => !isUnder(m))
    .flatMap((m) => [m, ...meters.filter((s) => s.parentMeterId === m.id)])
}
