import { db } from '@/data/db'
import { isLive, newRecord, optionalText } from '@/data/records'
import { listOwners } from '@/data/repositories/owners'
import { resolveShares } from '@/data/repositories/shares'
import { allocateExpense, needsShares } from '@/domain/allocation'
import type { Poisha } from '@/domain/money'
import { isIsoDate, isPeriod, isWithinNextMonth, type IsoDate } from '@/domain/period'
import { fail, hasErrors, ok, type Errors, type Result } from '@/domain/result'
import type { OwnerAmount } from '@/domain/split'
import type {
  Expense,
  ExpenseAllocation,
  ExpenseSource,
  Owner,
  SplitInput,
  SplitRule,
} from '@/domain/types'
import {
  attachmentTables,
  deletePhotos,
  MAX_PHOTOS,
  replacePhotos,
  restorePhotos,
  type PhotoInput,
} from '@/services/attachments'
import { todayInDhaka } from '@/services/clock'

/** Every split rule, in the order the expense editor offers them (AGENT.md 8.2). */
export const EXPENSE_SPLIT_RULES = [
  'BY_SHARE',
  'EQUAL',
  'SINGLE_OWNER',
  'CUSTOM_PERCENT',
  'CUSTOM_AMOUNT',
  'TENANT_PAID',
] as const satisfies readonly SplitRule[]

export interface ExpenseInput {
  id?: string | undefined
  buildingId: string
  categoryId: string
  meterId?: string | null
  period: string
  date: string
  dueDate?: string | null
  amount: Poisha
  units?: number | null
  isPaid: boolean
  paidByOwnerId?: string | null
  splitRule: SplitRule
  singleOwnerId?: string | null
  splitInputs?: SplitInput[] | null
  note?: string | null
  /** Where a new expense comes from; it is saved as confirmed (AGENT.md 8.3 step 1). */
  source?: ExpenseSource
  /** Confirms a draft as it is saved (AGENT.md 8.3 step 2). */
  confirm?: boolean
  /** The expense's photos after the save; left out, they stay as they are. */
  photos?: readonly PhotoInput[]
}

/** The tables saveExpense writes, for callers that save expenses inside their own transaction. */
export const expenseTables = () => [
  db.building,
  db.expenseCategory,
  db.meter,
  db.owner,
  db.shareSet,
  db.shareEntry,
  db.expense,
  db.expenseAllocation,
  ...attachmentTables(),
]

function validateFields(input: ExpenseInput, today: IsoDate): Errors {
  const errors: Errors = {}
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    errors.amount = 'errors.expense.amountPositive'
  if (!isPeriod(input.period)) errors.period = 'errors.period.invalid'
  else if (!isWithinNextMonth(input.period, today)) errors.period = 'errors.period.tooFarAhead'
  if (!isIsoDate(input.date)) errors.date = 'errors.date.invalid'
  if (input.dueDate && !isIsoDate(input.dueDate)) errors.dueDate = 'errors.date.invalid'
  if (input.units != null && (!Number.isSafeInteger(input.units) || input.units < 0))
    errors.units = 'errors.units.invalid'
  if (input.isPaid && !input.paidByOwnerId) errors.paidByOwnerId = 'errors.expense.payerRequired'
  if (input.photos && input.photos.length > MAX_PHOTOS) errors.photos = 'errors.photos.tooMany'
  return errors
}

function validateOwners(input: ExpenseInput, owners: Owner[]): Errors {
  const errors: Errors = {}
  const isOwner = (id: string | null | undefined) => owners.some((o) => o.id === id)
  if (input.isPaid && !isOwner(input.paidByOwnerId))
    errors.paidByOwnerId = 'errors.expense.payerRequired'
  if (input.splitRule === 'SINGLE_OWNER' && !isOwner(input.singleOwnerId))
    errors.singleOwnerId = 'errors.split.singleOwnerRequired'
  if (input.splitInputs?.some((i) => !isOwner(i.ownerId)))
    errors.splitInputs = 'errors.split.invalidInput'
  return errors
}

/** The allocations a confirmed expense needs, read inside the caller's transaction. */
async function allocationsFor(expense: Expense, owners: Owner[]): Promise<Result<OwnerAmount[]>> {
  if (expense.status !== 'CONFIRMED') return ok([])
  const shares = needsShares(expense.splitRule)
    ? await resolveShares(expense.buildingId, expense.period)
    : undefined
  if (shares && !shares.ok) return fail({ splitRule: 'errors.shares.noneForPeriod' })
  return allocateExpense(expense, {
    shares: shares?.value.owners ?? [],
    owners: owners.map((o) => ({ ownerId: o.id, sortOrder: o.sortOrder })),
  })
}

/** Replaces an expense's allocations; the old ones are soft-deleted (AGENT.md 8.3 step 3). */
async function replaceAllocations(expenseId: string, amounts: OwnerAmount[], now: number) {
  const old = (await db.expenseAllocation.where('expenseId').equals(expenseId).toArray()).filter(
    isLive,
  )
  await db.expenseAllocation.bulkPut(old.map((a) => ({ ...a, deletedAt: now, updatedAt: now })))
  await db.expenseAllocation.bulkAdd(
    amounts.map((a) =>
      newRecord<ExpenseAllocation>({ expenseId, ownerId: a.ownerId, amount: a.amount }, now),
    ),
  )
}

/**
 * Adds or edits an expense and, when it is confirmed, writes its allocations in the same
 * transaction, using the share set in force for its period (AGENT.md 8.3). Allocations are
 * computed only here, so later share changes never alter them (AGENT.md 0.2 rule 6).
 */
export async function saveExpense(
  input: ExpenseInput,
  today: IsoDate = todayInDhaka(),
): Promise<Result<Expense>> {
  const errors = validateFields(input, today)
  if (hasErrors(errors)) return fail(errors)

  return db.transaction('rw', expenseTables(), async () => {
    const building = await db.building.get(input.buildingId)
    if (!building || !isLive(building))
      return fail({ buildingId: 'errors.expense.buildingRequired' })
    const category = await db.expenseCategory.get(input.categoryId)
    if (!category || !isLive(category))
      return fail({ categoryId: 'errors.expense.categoryRequired' })
    if (input.meterId) {
      const meter = await db.meter.get(input.meterId)
      if (!meter || !isLive(meter) || meter.buildingId !== building.id)
        return fail({ meterId: 'errors.expense.meterInvalid' })
    }
    const existing = input.id ? await db.expense.get(input.id) : undefined
    if (input.id && (!existing || !isLive(existing)))
      return fail({ amount: 'errors.common.notFound' })

    const owners = await listOwners()
    const ownerErrors = validateOwners(input, owners)
    if (hasErrors(ownerErrors)) return fail(ownerErrors)

    const rule = input.splitRule
    const isCustom = rule === 'CUSTOM_PERCENT' || rule === 'CUSTOM_AMOUNT'
    const fields = {
      buildingId: building.id,
      categoryId: category.id,
      meterId: input.meterId || null,
      period: input.period,
      date: input.date,
      dueDate: input.dueDate || null,
      amount: input.amount,
      units: input.units ?? null,
      isPaid: input.isPaid,
      paidByOwnerId: input.isPaid ? (input.paidByOwnerId ?? null) : null,
      splitRule: rule,
      singleOwnerId: rule === 'SINGLE_OWNER' ? (input.singleOwnerId ?? null) : null,
      splitInputs: isCustom ? (input.splitInputs ?? null) : null,
      note: optionalText(input.note),
    }
    // validateFields checked the period and dates; the casts keep their branded types.
    const typed = fields as typeof fields & Pick<Expense, 'period' | 'date' | 'dueDate'>
    const now = Date.now()
    const expense: Expense = existing
      ? {
          ...existing,
          ...typed,
          status: input.confirm && existing.status === 'DRAFT' ? 'CONFIRMED' : existing.status,
          updatedAt: now,
        }
      : newRecord<Expense>(
          {
            ...typed,
            templateId: null,
            readingId: null,
            status: 'CONFIRMED',
            source: input.source ?? 'MANUAL',
          },
          now,
        )

    const amounts = await allocationsFor(expense, owners)
    if (!amounts.ok) return amounts
    await db.expense.put(expense)
    await replaceAllocations(expense.id, amounts.value, now)
    if (input.photos) await replacePhotos('EXPENSE', expense.id, input.photos, now)
    return ok(expense)
  })
}

/** Confirms a draft as it is and creates its allocations (AGENT.md 8.3 step 2). */
export async function confirmDraft(
  id: string,
  today: IsoDate = todayInDhaka(),
): Promise<Result<Expense>> {
  const draft = await db.expense.get(id)
  if (!draft || !isLive(draft) || draft.status !== 'DRAFT')
    return fail({ expense: 'errors.expense.notDraft' })
  return saveExpense({ ...draft, confirm: true }, today)
}

/** Skips a draft: it stays on record, creates no allocations and counts nowhere. */
export async function skipDraft(id: string): Promise<Result<Expense>> {
  return db.transaction('rw', db.expense, async () => {
    const draft = await db.expense.get(id)
    if (!draft || !isLive(draft) || draft.status !== 'DRAFT')
      return fail({ expense: 'errors.expense.notDraft' })
    const skipped: Expense = { ...draft, status: 'SKIPPED', updatedAt: Date.now() }
    await db.expense.put(skipped)
    return ok(skipped)
  })
}

/** Undoes skipDraft. */
export async function unskipDraft(id: string): Promise<void> {
  await db.transaction('rw', db.expense, async () => {
    const expense = await db.expense.get(id)
    if (expense?.status === 'SKIPPED')
      await db.expense.put({ ...expense, status: 'DRAFT', updatedAt: Date.now() })
  })
}

export interface DeletedExpense {
  expense: Expense
  /** The allocations and photos deleted with the expense, so that undo restores exactly these. */
  allocationIds: string[]
  attachmentIds: string[]
}

/** Soft-deletes an expense with its allocations and photos (AGENT.md 8.3 step 4, 8.11). */
export async function deleteExpense(id: string): Promise<Result<DeletedExpense>> {
  return db.transaction(
    'rw',
    [db.expense, db.expenseAllocation, ...attachmentTables()],
    async () => {
      const expense = await db.expense.get(id)
      if (!expense || !isLive(expense)) return fail({ expense: 'errors.common.notFound' })
      const now = Date.now()
      const allocations = (
        await db.expenseAllocation.where('expenseId').equals(id).toArray()
      ).filter(isLive)
      await db.expenseAllocation.bulkPut(
        allocations.map((a) => ({ ...a, deletedAt: now, updatedAt: now })),
      )
      const attachmentIds = await deletePhotos('EXPENSE', id, now)
      const deleted = { ...expense, deletedAt: now, updatedAt: now }
      await db.expense.put(deleted)
      return ok({ expense: deleted, allocationIds: allocations.map((a) => a.id), attachmentIds })
    },
  )
}

/** Undoes deleteExpense. */
export async function restoreExpense({
  expense,
  allocationIds,
  attachmentIds,
}: DeletedExpense): Promise<void> {
  await db.transaction(
    'rw',
    [db.expense, db.expenseAllocation, ...attachmentTables()],
    async () => {
      const current = await db.expense.get(expense.id)
      if (!current?.deletedAt) return
      const now = Date.now()
      const allocations = (await db.expenseAllocation.bulkGet(allocationIds)).filter(
        (a) => a !== undefined,
      )
      await db.expenseAllocation.bulkPut(
        allocations.map((a) => ({ ...a, deletedAt: null, updatedAt: now })),
      )
      await restorePhotos(attachmentIds, now)
      await db.expense.put({ ...current, deletedAt: null, updatedAt: now })
    },
  )
}
