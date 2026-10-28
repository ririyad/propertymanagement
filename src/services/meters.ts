import { db } from '@/data/db'
import { isLive, newRecord, optionalText, sameName } from '@/data/records'
import { isPeriod, type Period } from '@/domain/period'
import { fail, hasErrors, ok, type Errors, type Result } from '@/domain/result'
import { validateTariff, type TariffRates } from '@/domain/tariff'
import type { Meter, MeterPayer, MeterType, Tariff } from '@/domain/types'

export const METER_TYPES = ['POSTPAID', 'PREPAID', 'SUB'] as const satisfies readonly MeterType[]
export const METER_PAYERS = ['OWNERS', 'TENANT'] as const satisfies readonly MeterPayer[]

export interface MeterInput {
  id?: string | undefined
  buildingId: string
  label: string
  meterNo?: string | null
  type: MeterType
  payer: MeterPayer
  /** Kept only for a sub meter. */
  parentMeterId?: string | null
  categoryId: string
  isActive: boolean
}

/** Readings and expenses of a meter. A meter that has any keeps its type and is not deleted. */
async function countRecords(meterId: string): Promise<number> {
  const counts = await Promise.all([
    db.meterReading.where('meterId').equals(meterId).filter(isLive).count(),
    db.expense.where('meterId').equals(meterId).filter(isLive).count(),
  ])
  return counts[0] + counts[1]
}

/**
 * Adds or edits a meter (AGENT.md 7.3). Until flats exist every meter is common to its building
 * (D38). A sub meter's parent is a postpaid or prepaid meter of the same building.
 */
export async function saveMeter(input: MeterInput): Promise<Result<Meter>> {
  const label = input.label.trim()
  const errors: Errors = {}
  if (label === '') errors.label = 'errors.meter.labelRequired'
  if (!METER_TYPES.some((t) => t === input.type)) errors.type = 'errors.meter.typeInvalid'
  if (!METER_PAYERS.some((p) => p === input.payer)) errors.payer = 'errors.meter.payerInvalid'
  if (hasErrors(errors)) return fail(errors)
  const parentMeterId = input.type === 'SUB' ? input.parentMeterId || null : null

  return db.transaction(
    'rw',
    [db.building, db.meter, db.expenseCategory, db.meterReading, db.expense],
    async () => {
      const building = await db.building.get(input.buildingId)
      if (!building || !isLive(building)) return fail({ label: 'errors.common.notFound' })
      const existing = input.id ? await db.meter.get(input.id) : undefined
      if (input.id && (!existing || !isLive(existing) || existing.buildingId !== building.id))
        return fail({ label: 'errors.common.notFound' })

      const meters = (await db.meter.where('buildingId').equals(building.id).toArray()).filter(
        isLive,
      )
      if (meters.some((m) => m.id !== input.id && sameName(m.label, label)))
        return fail({ label: 'errors.meter.labelTaken' })

      if (parentMeterId) {
        const parent = meters.find((m) => m.id === parentMeterId)
        if (!parent || parent.id === input.id || parent.type === 'SUB')
          return fail({ parentMeterId: 'errors.meter.parentInvalid' })
      }

      const category = await db.expenseCategory.get(input.categoryId)
      if (!category || !isLive(category) || category.kind !== 'METER')
        return fail({ categoryId: 'errors.meter.categoryInvalid' })

      if (existing && existing.type !== input.type) {
        if (input.type === 'SUB' && meters.some((m) => m.parentMeterId === existing.id))
          return fail({ type: 'errors.meter.hasSubMeters' })
        if ((await countRecords(existing.id)) > 0) return fail({ type: 'errors.meter.typeLocked' })
      }

      const now = Date.now()
      const fields = {
        buildingId: building.id,
        label,
        meterNo: optionalText(input.meterNo),
        type: input.type,
        scope: 'COMMON' as const,
        flatId: null,
        payer: input.payer,
        parentMeterId,
        categoryId: category.id,
        isActive: input.isActive,
      }
      const meter: Meter = existing
        ? { ...existing, ...fields, updatedAt: now }
        : newRecord<Meter>(fields, now)
      await db.meter.put(meter)
      return ok(meter)
    },
  )
}

/** Soft-deletes a meter that has no sub meters, readings or expenses. */
export async function deleteMeter(id: string): Promise<Result<Meter>> {
  return db.transaction('rw', [db.meter, db.meterReading, db.expense], async () => {
    const meter = await db.meter.get(id)
    if (!meter || !isLive(meter)) return fail({ meter: 'errors.common.notFound' })
    const subMeters = await db.meter.where('parentMeterId').equals(id).filter(isLive).count()
    if (subMeters > 0) return fail({ meter: 'errors.meter.hasSubMeters' })
    if ((await countRecords(id)) > 0) return fail({ meter: 'errors.meter.inUse' })

    const now = Date.now()
    const deleted = { ...meter, deletedAt: now, updatedAt: now }
    await db.meter.put(deleted)
    return ok(deleted)
  })
}

/** Undoes deleteMeter. */
export async function restoreMeter(id: string): Promise<void> {
  await db.meter.update(id, { deletedAt: null, updatedAt: Date.now() })
}

export interface TariffInput extends TariffRates {
  id?: string | undefined
  meterId: string
  effectiveFrom: Period
}

/**
 * Adds or edits a sub meter's tariff (AGENT.md 7.3, 8.5). Only the fields of the chosen mode are
 * stored. Bills already saved keep their amounts (D42).
 */
export async function saveTariff(input: TariffInput): Promise<Result<Tariff>> {
  const errors = validateTariff(input)
  if (!isPeriod(input.effectiveFrom)) errors.effectiveFrom = 'errors.period.invalid'
  if (hasErrors(errors)) return fail(errors)

  return db.transaction('rw', [db.meter, db.tariff], async () => {
    const meter = await db.meter.get(input.meterId)
    if (!meter || !isLive(meter)) return fail({ meterId: 'errors.common.notFound' })
    if (meter.type !== 'SUB') return fail({ meterId: 'errors.tariff.subMeterOnly' })
    const existing = input.id ? await db.tariff.get(input.id) : undefined
    if (input.id && (!existing || !isLive(existing) || existing.meterId !== meter.id))
      return fail({ effectiveFrom: 'errors.common.notFound' })

    const sameMonth = await db.tariff
      .where('[meterId+effectiveFrom]')
      .equals([meter.id, input.effectiveFrom])
      .filter((t) => isLive(t) && t.id !== input.id)
      .count()
    if (sameMonth > 0) return fail({ effectiveFrom: 'errors.tariff.effectiveFromTaken' })

    const rates =
      input.mode === 'FLAT'
        ? { mode: input.mode, flatRate: input.flatRate, slabMode: null, slabs: [] }
        : {
            mode: input.mode,
            flatRate: null,
            slabMode: input.slabMode,
            slabs: input.slabs.map((s) => ({ upToUnits: s.upToUnits, rate: s.rate })),
          }
    const fields = {
      meterId: meter.id,
      effectiveFrom: input.effectiveFrom,
      ...rates,
      fixedChargeMonthly: input.fixedChargeMonthly,
      vatBp: input.vatBp,
      vatOnFixed: input.vatOnFixed,
    }
    const now = Date.now()
    const tariff: Tariff = existing
      ? { ...existing, ...fields, updatedAt: now }
      : newRecord<Tariff>(fields, now)
    await db.tariff.put(tariff)
    return ok(tariff)
  })
}

export async function deleteTariff(id: string): Promise<Result<Tariff>> {
  return db.transaction('rw', db.tariff, async () => {
    const tariff = await db.tariff.get(id)
    if (!tariff || !isLive(tariff)) return fail({ tariff: 'errors.common.notFound' })
    const now = Date.now()
    const deleted = { ...tariff, deletedAt: now, updatedAt: now }
    await db.tariff.put(deleted)
    return ok(deleted)
  })
}

/** Undoes deleteTariff. */
export async function restoreTariff(id: string): Promise<void> {
  await db.tariff.update(id, { deletedAt: null, updatedAt: Date.now() })
}
