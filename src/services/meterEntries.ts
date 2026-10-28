import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Poisha } from '@/domain/money'
import { isIsoDate, periodOf, type IsoDate } from '@/domain/period'
import { fail, type Result } from '@/domain/result'
import type { Expense } from '@/domain/types'
import type { PhotoInput } from '@/services/attachments'
import { todayInDhaka } from '@/services/clock'
import { saveExpense } from '@/services/expenses'

export interface MeterEntryInput {
  /** The expense being edited. */
  id?: string | undefined
  meterId: string
  amount: Poisha
  /** Postpaid: the bill's month. A recharge belongs to the month of its date. */
  period?: string
  /** Postpaid only. */
  dueDate?: string | null
  /** When a postpaid bill was paid (if it was), or when a prepaid meter was recharged. */
  paidDate?: string | null
  paidByOwnerId?: string | null
  /** Postpaid only: units printed on the bill, for information. */
  units?: number | null
  note?: string | null
  photos?: readonly PhotoInput[]
}

/**
 * Records a postpaid bill or a prepaid recharge as one confirmed expense of the meter's
 * category (AGENT.md 8.4). A tenant-paid meter's entry is kept for reference only
 * (`TENANT_PAID`, no payer). Editing keeps the expense's split.
 */
export async function saveMeterEntry(
  input: MeterEntryInput,
  today: IsoDate = todayInDhaka(),
): Promise<Result<Expense>> {
  const meter = await db.meter.get(input.meterId)
  if (!meter || !isLive(meter) || meter.type === 'SUB')
    return fail({ meterId: 'errors.expense.meterInvalid' })
  const category = await db.expenseCategory.get(meter.categoryId)
  const existing = input.id ? await db.expense.get(input.id) : undefined

  const prepaid = meter.type === 'PREPAID'
  const tenantPays = meter.payer === 'TENANT'
  const paidText = input.paidDate || null
  const dueText = prepaid ? null : input.dueDate || null
  if (prepaid && !paidText) return fail({ paidDate: 'errors.meterEntry.rechargeDateRequired' })
  if (paidText && !isIsoDate(paidText)) return fail({ paidDate: 'errors.date.invalid' })
  if (dueText && !isIsoDate(dueText)) return fail({ dueDate: 'errors.date.invalid' })
  const paidDate = paidText && isIsoDate(paidText) ? paidText : null
  const dueDate = dueText && isIsoDate(dueText) ? dueText : null

  const result = await saveExpense(
    {
      id: input.id,
      buildingId: meter.buildingId,
      categoryId: meter.categoryId,
      meterId: meter.id,
      period: prepaid && paidDate ? periodOf(paidDate) : (input.period ?? ''),
      date: paidDate ?? dueDate ?? today,
      dueDate,
      amount: input.amount,
      units: prepaid ? null : (input.units ?? null),
      isPaid: !tenantPays && paidDate !== null,
      paidByOwnerId: tenantPays ? null : (input.paidByOwnerId ?? null),
      splitRule: tenantPays
        ? 'TENANT_PAID'
        : (existing?.splitRule ?? category?.defaultSplitRule ?? 'BY_SHARE'),
      singleOwnerId: existing?.singleOwnerId ?? null,
      splitInputs: existing?.splitInputs ?? null,
      note: input.note ?? null,
      source: prepaid ? 'METER_PREPAID' : 'METER_POSTPAID',
      ...(input.photos ? { photos: input.photos } : {}),
    },
    today,
  )
  // A recharge's month comes from its date, so report a month error on the date.
  if (!result.ok && prepaid && result.errors.period) {
    const { period, ...rest } = result.errors
    return fail({ ...rest, paidDate: period })
  }
  return result
}
