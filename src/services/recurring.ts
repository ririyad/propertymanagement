import { db } from '@/data/db'
import { isLive, newRecord, optionalText } from '@/data/records'
import type { Poisha } from '@/domain/money'
import { isPeriod, periodOf, type IsoDate } from '@/domain/period'
import { draftDate, duePeriods } from '@/domain/recurring'
import { fail, hasErrors, ok, type Errors, type Result } from '@/domain/result'
import type { Expense, Frequency, RecurringTemplate, SplitRule } from '@/domain/types'
import { CATEGORY_SPLIT_RULES } from '@/services/categories'
import { todayInDhaka } from '@/services/clock'
import { expenseTables, saveExpense } from '@/services/expenses'

export const FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
] as const satisfies readonly Frequency[]

export interface TemplateInput {
  id?: string | undefined
  buildingId: string
  categoryId: string
  amount: Poisha
  frequency: Frequency
  startPeriod: string
  endPeriod?: string | null | undefined
  dueDay: number
  defaultPaidByOwnerId?: string | null | undefined
  splitRule: SplitRule
  isActive: boolean
  note?: string | null | undefined
}

function validateTemplate(input: TemplateInput): Errors {
  const errors: Errors = {}
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    errors.amount = 'errors.expense.amountPositive'
  if (!FREQUENCIES.some((f) => f === input.frequency))
    errors.frequency = 'errors.template.frequencyInvalid'
  if (!isPeriod(input.startPeriod)) errors.startPeriod = 'errors.period.invalid'
  if (input.endPeriod) {
    if (!isPeriod(input.endPeriod)) errors.endPeriod = 'errors.period.invalid'
    else if (input.endPeriod < input.startPeriod)
      errors.endPeriod = 'errors.template.endBeforeStart'
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28)
    errors.dueDay = 'errors.template.dueDayInvalid'
  if (!CATEGORY_SPLIT_RULES.some((r) => r === input.splitRule))
    errors.splitRule = 'errors.category.splitRuleInvalid'
  return errors
}

/**
 * Adds or edits a recurring cost (AGENT.md 7.4, 8.6) and creates its drafts up to this month.
 * Drafts already created keep their amounts.
 */
export async function saveTemplate(
  input: TemplateInput,
  today: IsoDate = todayInDhaka(),
): Promise<Result<RecurringTemplate>> {
  const errors = validateTemplate(input)
  if (hasErrors(errors)) return fail(errors)

  const saved = await db.transaction(
    'rw',
    [db.building, db.expenseCategory, db.owner, db.recurringTemplate],
    async (): Promise<Result<RecurringTemplate>> => {
      const building = await db.building.get(input.buildingId)
      if (!building || !isLive(building))
        return fail({ buildingId: 'errors.expense.buildingRequired' })
      const existing = input.id ? await db.recurringTemplate.get(input.id) : undefined
      if (input.id && (!existing || !isLive(existing)))
        return fail({ amount: 'errors.common.notFound' })
      const category = await db.expenseCategory.get(input.categoryId)
      // A hidden category stays on a template that already has it (D41).
      const usable =
        category &&
        isLive(category) &&
        category.kind !== 'METER' &&
        (!category.isHidden || existing?.categoryId === category.id)
      if (!usable) return fail({ categoryId: 'errors.template.categoryInvalid' })
      if (input.defaultPaidByOwnerId) {
        const owner = await db.owner.get(input.defaultPaidByOwnerId)
        if (!owner || !isLive(owner))
          return fail({ defaultPaidByOwnerId: 'errors.template.payerInvalid' })
      }

      const fields = {
        buildingId: building.id,
        categoryId: input.categoryId,
        amount: input.amount,
        frequency: input.frequency,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod || null,
        dueDay: input.dueDay,
        defaultPaidByOwnerId: input.defaultPaidByOwnerId || null,
        splitRule: input.splitRule,
        isActive: input.isActive ? 1 : 0,
        note: optionalText(input.note),
      } as const
      // validateTemplate checked the months; the cast keeps their branded types.
      const typed = fields as typeof fields & Pick<RecurringTemplate, 'startPeriod' | 'endPeriod'>
      const now = Date.now()
      const template: RecurringTemplate = existing
        ? { ...existing, ...typed, updatedAt: now }
        : newRecord<RecurringTemplate>(typed, now)
      await db.recurringTemplate.put(template)
      return ok(template)
    },
  )
  if (saved.ok) await generateDrafts(today, saved.value.id)
  return saved
}

export interface DeletedTemplate {
  template: RecurringTemplate
  /** The drafts deleted with the template, so that undo restores exactly these. */
  draftIds: string[]
}

/** Soft-deletes a template and its drafts not yet confirmed or skipped. */
export async function deleteTemplate(id: string): Promise<Result<DeletedTemplate>> {
  return db.transaction('rw', [db.recurringTemplate, db.expense], async () => {
    const template = await db.recurringTemplate.get(id)
    if (!template || !isLive(template)) return fail({ template: 'errors.common.notFound' })
    const now = Date.now()
    const drafts = (await templateExpenses(id)).filter((e) => isLive(e) && e.status === 'DRAFT')
    const deleted = { ...template, deletedAt: now, updatedAt: now }
    await db.recurringTemplate.put(deleted)
    await db.expense.bulkPut(drafts.map((d) => ({ ...d, deletedAt: now, updatedAt: now })))
    return ok({ template: deleted, draftIds: drafts.map((d) => d.id) })
  })
}

/** Undoes deleteTemplate. */
export async function restoreTemplate({ template, draftIds }: DeletedTemplate): Promise<void> {
  await db.transaction('rw', [db.recurringTemplate, db.expense], async () => {
    const now = Date.now()
    await db.recurringTemplate.update(template.id, { deletedAt: null, updatedAt: now })
    for (const id of draftIds) await db.expense.update(id, { deletedAt: null, updatedAt: now })
  })
}

/** Every expense a template created, deleted and skipped ones included. */
function templateExpenses(templateId: string): Promise<Expense[]> {
  return db.expense
    .where('[templateId+period]')
    .between([templateId, ''], [templateId, '￿'])
    .toArray()
}

/**
 * Creates the missing drafts of every active template (or of one) for each due month up to this
 * month (AGENT.md 8.6). A month that ever had an expense from the template, deleted or skipped
 * included, gets no new draft, so running it again changes nothing. Returns the drafts created.
 */
export async function generateDrafts(
  today: IsoDate = todayInDhaka(),
  templateId?: string,
): Promise<number> {
  return db.transaction('rw', [db.recurringTemplate, db.expense], async () => {
    const templates = templateId
      ? [await db.recurringTemplate.get(templateId)]
      : await db.recurringTemplate.toArray()
    const now = Date.now()
    let created = 0
    for (const template of templates) {
      if (!template || !isLive(template) || template.isActive !== 1) continue
      const done = new Set((await templateExpenses(template.id)).map((e) => e.period))
      const drafts = duePeriods(template, periodOf(today))
        .filter((p) => !done.has(p))
        .map((p) =>
          newRecord<Expense>(
            {
              buildingId: template.buildingId,
              categoryId: template.categoryId,
              meterId: null,
              templateId: template.id,
              readingId: null,
              period: p,
              date: draftDate(p, template.dueDay),
              dueDate: null,
              amount: template.amount,
              units: null,
              status: 'DRAFT',
              source: 'RECURRING',
              // A template's default payer marks its drafts as paid by that owner (D44).
              isPaid: template.defaultPaidByOwnerId !== null,
              paidByOwnerId: template.defaultPaidByOwnerId,
              splitRule: template.splitRule,
              singleOwnerId: null,
              splitInputs: null,
              note: template.note,
            },
            now,
          ),
        )
      await db.expense.bulkAdd(drafts)
      created += drafts.length
    }
    return created
  })
}

export interface ConfirmInput {
  id: string
  amount: Poisha
  isPaid: boolean
  paidByOwnerId: string | null
  /** "Also use this amount from now on": the template and its later drafts take the amount. */
  useFromNowOn?: boolean
}

/** Confirms a draft with the amount and payment the user set (AGENT.md 8.6 rule 4). */
export async function confirmDraftAs(
  input: ConfirmInput,
  today: IsoDate = todayInDhaka(),
): Promise<Result<Expense>> {
  return db.transaction('rw', [...expenseTables(), db.recurringTemplate], async () => {
    const draft = await db.expense.get(input.id)
    if (!draft || !isLive(draft) || draft.status !== 'DRAFT')
      return fail({ expense: 'errors.expense.notDraft' })
    const confirmed = await saveExpense(
      {
        ...draft,
        amount: input.amount,
        isPaid: input.isPaid,
        paidByOwnerId: input.paidByOwnerId,
        confirm: true,
      },
      today,
    )
    if (!confirmed.ok || !input.useFromNowOn || !draft.templateId) return confirmed

    const now = Date.now()
    const template = await db.recurringTemplate.get(draft.templateId)
    if (template && isLive(template))
      await db.recurringTemplate.put({ ...template, amount: input.amount, updatedAt: now })
    const later = (await templateExpenses(draft.templateId)).filter(
      (e) => isLive(e) && e.status === 'DRAFT' && e.period > draft.period,
    )
    await db.expense.bulkPut(later.map((e) => ({ ...e, amount: input.amount, updatedAt: now })))
    return confirmed
  })
}

/** Errors of several drafts confirmed together, keyed `<draft id>.<field>`. */
export async function confirmDrafts(
  inputs: readonly ConfirmInput[],
  today: IsoDate = todayInDhaka(),
): Promise<Errors> {
  const errors: Errors = {}
  for (const input of inputs) {
    const result = await confirmDraftAs(input, today)
    if (!result.ok)
      for (const [field, error] of Object.entries(result.errors))
        errors[`${input.id}.${field}`] = error
  }
  return errors
}
