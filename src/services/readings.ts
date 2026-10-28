import { db } from '@/data/db'
import { isLive, newRecord } from '@/data/records'
import { computeReading, type ReadingOutcome } from '@/domain/meterBill'
import { isIsoDate, isPeriod, isWithinNextMonth, type IsoDate } from '@/domain/period'
import { fail, hasErrors, ok, type Errors, type Result } from '@/domain/result'
import type { Meter, MeterReading } from '@/domain/types'
import { replacePhotos, type PhotoInput } from '@/services/attachments'
import { todayInDhaka } from '@/services/clock'
import { attachmentTables, deletePhotos, restorePhotos } from '@/services/attachments'
import {
  deleteExpense,
  expenseTables,
  restoreExpense,
  saveExpense,
  type DeletedExpense,
} from '@/services/expenses'

export interface ReadingEntryInput {
  meterId: string
  readingUnits: number
  isReset: boolean
  /** Units used entered by hand on a reset reading; without them the reset is a new baseline. */
  manualUnitsUsed?: number | null
  photos?: readonly PhotoInput[]
}

export interface ReadingsInput {
  buildingId: string
  period: string
  readOn: string
  entries: readonly ReadingEntryInput[]
}

/** Stops the transaction so that a batch of readings is saved whole or not at all. */
class NotSaved extends Error {
  constructor(readonly errors: Errors) {
    super('Readings not saved')
  }
}

function prefixed(errors: Errors, prefix: string): Errors {
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [prefix + key, value]))
}

function resultFields(outcome: ReadingOutcome) {
  return outcome.kind === 'BASELINE'
    ? { unitsUsed: null, billAmount: null, billBreakdown: null }
    : { unitsUsed: outcome.unitsUsed, billAmount: outcome.bill.total, billBreakdown: outcome.bill }
}

/**
 * Keeps a reading's expense in step with its bill (AGENT.md 8.4): an owner-paid sub meter
 * without a main meter has one confirmed expense per billed reading. The expense keeps any
 * payer or split the user set on it.
 */
async function syncExpense(meter: Meter, reading: MeterReading, prefix: string, today: IsoDate) {
  const linked = await db.expense
    .where('meterId')
    .equals(meter.id)
    .filter((e) => isLive(e) && e.readingId === reading.id)
    .first()
  const billed = meter.payer === 'OWNERS' && meter.parentMeterId === null
  if (!billed || reading.billAmount === null || reading.billAmount <= 0) {
    if (linked) await deleteExpense(linked.id)
    return
  }

  // An unchanged bill keeps its expense and allocations as they are (AGENT.md 0.2 rule 6).
  if (
    linked &&
    linked.amount === reading.billAmount &&
    linked.units === reading.unitsUsed &&
    linked.period === reading.period &&
    linked.date === reading.readOn
  )
    return

  const category = await db.expenseCategory.get(meter.categoryId)
  const result = await saveExpense(
    {
      id: linked?.id,
      buildingId: meter.buildingId,
      categoryId: meter.categoryId,
      meterId: meter.id,
      period: reading.period,
      date: reading.readOn,
      amount: reading.billAmount,
      units: reading.unitsUsed,
      isPaid: linked?.isPaid ?? false,
      paidByOwnerId: linked?.paidByOwnerId ?? null,
      splitRule: linked?.splitRule ?? category?.defaultSplitRule ?? 'BY_SHARE',
      singleOwnerId: linked?.singleOwnerId ?? null,
      splitInputs: linked?.splitInputs ?? null,
      note: linked?.note ?? null,
      source: 'METER_SUB',
    },
    today,
  )
  if (!result.ok) throw new NotSaved(prefixed(result.errors, prefix))
  if (!linked) await db.expense.update(result.value.id, { readingId: reading.id })
}

/**
 * Saves a month's sub-meter readings of a building in one transaction (AGENT.md 8.4): each is
 * checked against the meter's earlier readings and billed with the tariff in force, and the
 * meter's next reading is billed again from it (rule 7). Errors are keyed `entries.<i>.<field>`;
 * if any entry fails, nothing is saved.
 */
export async function saveReadings(
  input: ReadingsInput,
  today: IsoDate = todayInDhaka(),
): Promise<Result<MeterReading[]>> {
  const { period, readOn } = input
  const errors: Errors = {}
  if (!isPeriod(period)) errors.period = 'errors.period.invalid'
  else if (!isWithinNextMonth(period, today)) errors.period = 'errors.period.tooFarAhead'
  if (!isIsoDate(readOn)) errors.readOn = 'errors.date.invalid'
  if (hasErrors(errors) || !isPeriod(period) || !isIsoDate(readOn)) return fail(errors)

  try {
    return await db.transaction(
      'rw',
      [db.meter, db.meterReading, db.tariff, ...expenseTables()],
      async () => {
        const now = Date.now()
        const plans: {
          meter: Meter
          reading: MeterReading
          next: MeterReading | undefined
          prefix: string
          photos: readonly PhotoInput[] | undefined
        }[] = []

        for (const [i, entry] of input.entries.entries()) {
          const prefix = `entries.${i}.`
          const meter = await db.meter.get(entry.meterId)
          if (
            !meter ||
            !isLive(meter) ||
            meter.type !== 'SUB' ||
            meter.buildingId !== input.buildingId
          ) {
            errors[`${prefix}readingUnits`] = 'errors.common.notFound'
            continue
          }
          const readings = (
            await db.meterReading.where('meterId').equals(meter.id).toArray()
          ).filter(isLive)
          const tariffs = (await db.tariff.where('meterId').equals(meter.id).toArray()).filter(
            isLive,
          )
          const existing = readings.find((r) => r.period === period)
          const others = readings.filter((r) => r !== existing)

          const outcome = computeReading(
            {
              period,
              readingUnits: entry.readingUnits,
              isReset: entry.isReset,
              manualUnitsUsed: entry.manualUnitsUsed ?? null,
            },
            others,
            tariffs,
          )
          if (!outcome.ok) {
            Object.assign(errors, prefixed(outcome.errors, prefix))
            continue
          }
          const fields = {
            meterId: meter.id,
            period,
            readingUnits: entry.readingUnits,
            isReset: entry.isReset,
            readOn,
            ...resultFields(outcome.value),
          }
          const reading: MeterReading = existing
            ? { ...existing, ...fields, updatedAt: now }
            : newRecord<MeterReading>(fields, now)

          // The next reading is billed from this one (AGENT.md 8.4 rule 7).
          const following = others
            .filter((r) => r.period > period)
            .sort((a, b) => a.period.localeCompare(b.period))[0]
          let next: MeterReading | undefined
          if (following) {
            const again = computeReading(
              {
                period: following.period,
                readingUnits: following.readingUnits,
                isReset: following.isReset,
                manualUnitsUsed: following.isReset ? following.unitsUsed : null,
              },
              [...others.filter((r) => r.id !== following.id), reading],
              tariffs,
            )
            if (!again.ok) {
              errors[`${prefix}readingUnits`] = 'errors.reading.higherThanNext'
              continue
            }
            const billed = resultFields(again.value)
            if (
              billed.billAmount !== following.billAmount ||
              billed.unitsUsed !== following.unitsUsed
            )
              next = { ...following, ...billed, updatedAt: now }
          }
          plans.push({ meter, reading, next, prefix, photos: entry.photos })
        }
        if (hasErrors(errors)) throw new NotSaved(errors)

        for (const { meter, reading, next, prefix, photos } of plans) {
          await db.meterReading.put(reading)
          await syncExpense(meter, reading, prefix, today)
          if (next) {
            await db.meterReading.put(next)
            await syncExpense(meter, next, prefix, today)
          }
          if (photos) await replacePhotos('READING', reading.id, photos, now)
        }
        return ok(plans.map((p) => p.reading))
      },
    )
  } catch (error) {
    if (error instanceof NotSaved) return fail(error.errors)
    throw error
  }
}

export interface DeletedReading {
  reading: MeterReading
  /** The bill and photos deleted with the reading, so that undo restores exactly these. */
  expense: DeletedExpense | null
  attachmentIds: string[]
}

/**
 * Soft-deletes a meter's latest reading with its bill and photos. Only the latest can go, because
 * an earlier one is the starting point of the bill after it.
 */
export async function deleteReading(id: string): Promise<Result<DeletedReading>> {
  return db.transaction('rw', [db.meterReading, ...expenseTables()], async () => {
    const reading = await db.meterReading.get(id)
    if (!reading || !isLive(reading)) return fail({ reading: 'errors.common.notFound' })
    const later = await db.meterReading
      .where('meterId')
      .equals(reading.meterId)
      .filter((r) => isLive(r) && r.period > reading.period)
      .count()
    if (later > 0) return fail({ reading: 'errors.reading.notLatest' })

    const now = Date.now()
    const linked = await db.expense
      .where('meterId')
      .equals(reading.meterId)
      .filter((e) => isLive(e) && e.readingId === reading.id)
      .first()
    const expense = linked ? await deleteExpense(linked.id) : null
    if (expense && !expense.ok) return expense
    const deleted = { ...reading, deletedAt: now, updatedAt: now }
    await db.meterReading.put(deleted)
    const attachmentIds = await deletePhotos('READING', reading.id, now)
    return ok({ reading: deleted, expense: expense?.value ?? null, attachmentIds })
  })
}

/** Undoes deleteReading. */
export async function restoreReading(deleted: DeletedReading): Promise<void> {
  await db.transaction(
    'rw',
    [db.meterReading, ...expenseTables(), ...attachmentTables()],
    async () => {
      const now = Date.now()
      await db.meterReading.update(deleted.reading.id, { deletedAt: null, updatedAt: now })
      if (deleted.expense) await restoreExpense(deleted.expense)
      await restorePhotos(deleted.attachmentIds, now)
    },
  )
}
