import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ChangeEvent } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { isLive } from '@/data/records'
import { getAttachmentBlob, listAttachments } from '@/data/repositories/attachments'
import { getExpense } from '@/data/repositories/expenses'
import { listMeters } from '@/data/repositories/meters'
import { resolveShares } from '@/data/repositories/shares'
import { allocateExpense, needsShares } from '@/domain/allocation'
import { parsePercent, totalBp } from '@/domain/bp'
import { parseTaka, poisha, sum, type Poisha } from '@/domain/money'
import { isPeriod, periodOf, type IsoDate } from '@/domain/period'
import { hasErrors, type Errors } from '@/domain/result'
import type {
  Building,
  Expense,
  ExpenseCategory,
  Owner,
  SplitInput,
  SplitRule,
} from '@/domain/types'
import { useBuildings, useCategories, useOwners } from '@/features/shared/useLookups'
import { todayInDhaka } from '@/services/clock'
import { EXPENSE_SPLIT_RULES, saveExpense } from '@/services/expenses'
import { Button } from '@/ui/components/button'
import { Input, Select, Textarea } from '@/ui/components/input'
import { CheckboxField, ErrorText, Field } from '@/ui/Field'
import { formatBp, formatPeriod, formatTaka, percentInputValue, takaInputValue } from '@/ui/format'
import { PageHeader } from '@/ui/PageHeader'
import { toPhotoInput, type PhotoItem } from '@/ui/photos'
import { PhotoSlots } from '@/ui/PhotoSlots'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/**
 * Adds an expense (`/expenses/new`, optionally with `?building=&month=&category=`) or edits one
 * (`/expenses/:id/edit`), AGENT.md section 9, P1-T07.
 */
export function ExpenseEditPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const owners = useOwners()
  const buildings = useBuildings()
  const categories = useCategories()
  const loaded = useLiveQuery(async () => {
    if (!id) return { expense: undefined, photos: [] }
    const expense = await getExpense(id)
    if (!expense || !isLive(expense)) return null
    const photos: PhotoItem[] = []
    for (const attachment of await listAttachments('EXPENSE', expense.id)) {
      const blob = await getAttachmentBlob(attachment.id)
      if (blob) {
        const { id, width, height } = attachment
        photos.push({ key: id, attachmentId: id, blob, width, height })
      }
    }
    return { expense, photos }
  }, [id])
  if (!loaded || !owners || !buildings || !categories) return null

  const today = todayInDhaka()
  return (
    <ExpenseForm
      key={loaded.expense?.id ?? 'new'}
      expense={loaded.expense}
      initialPhotos={loaded.photos}
      defaults={formDefaults(loaded.expense, { owners, buildings, categories, params, today })}
      owners={owners}
      buildings={buildings}
      categories={categories}
    />
  )
}

interface FormValues {
  amount: string
  categoryId: string
  buildingId: string
  meterId: string
  period: string
  date: string
  isPaid: boolean
  paidByOwnerId: string
  splitRule: SplitRule
  singleOwnerId: string
  /** One value per owner, in owner order: a percentage or an amount in taka. */
  custom: { ownerId: string; value: string }[]
  note: string
}

function isCustom(rule: SplitRule): boolean {
  return rule === 'CUSTOM_PERCENT' || rule === 'CUSTOM_AMOUNT'
}

function formDefaults(
  expense: Expense | undefined,
  context: {
    owners: Owner[]
    buildings: Building[]
    categories: ExpenseCategory[]
    params: URLSearchParams
    today: IsoDate
  },
): FormValues {
  const { owners, buildings, categories, params, today } = context
  const payer = owners.find((o) => o.isPrimary)?.id ?? ''
  if (expense) {
    const customValue = (ownerId: string) => {
      const input = expense.splitInputs?.find((i) => i.ownerId === ownerId)
      if (!input) return ''
      return expense.splitRule === 'CUSTOM_PERCENT'
        ? percentInputValue(input.value)
        : takaInputValue(poisha(input.value))
    }
    return {
      amount: takaInputValue(expense.amount),
      categoryId: expense.categoryId,
      buildingId: expense.buildingId,
      meterId: expense.meterId ?? '',
      period: expense.period,
      date: expense.date,
      isPaid: expense.isPaid,
      paidByOwnerId: expense.paidByOwnerId ?? payer,
      splitRule: expense.splitRule,
      singleOwnerId: expense.singleOwnerId ?? '',
      custom: owners.map((o) => ({ ownerId: o.id, value: customValue(o.id) })),
      note: expense.note ?? '',
    }
  }

  const month = params.get('month') ?? ''
  const period = isPeriod(month) ? month : periodOf(today)
  const category = categories.find((c) => c.id === params.get('category'))
  return {
    amount: '',
    categoryId: category?.id ?? '',
    buildingId: params.get('building') ?? buildings[0]?.id ?? '',
    meterId: '',
    period,
    date: period === periodOf(today) ? today : `${period}-01`,
    isPaid: true,
    paidByOwnerId: payer,
    splitRule: category?.defaultSplitRule ?? 'BY_SHARE',
    singleOwnerId: '',
    custom: owners.map((o) => ({ ownerId: o.id, value: '' })),
    note: '',
  }
}

type SplitFields = Pick<FormValues, 'amount' | 'splitRule' | 'custom'>

/** Reads the amount and custom split as typed, with errors keyed like the expense service's. */
function readSplit(values: SplitFields): {
  amount: Poisha | undefined
  splitInputs: SplitInput[] | null
  errors: Errors
} {
  const errors: Errors = {}
  const amount = parseTaka(values.amount)
  if (!amount.ok) errors.amount = amount.error
  const inputs: SplitInput[] = []
  if (isCustom(values.splitRule)) {
    values.custom.forEach((entry, i) => {
      if (entry.value.trim() === '') return
      const parsed =
        values.splitRule === 'CUSTOM_PERCENT' ? parsePercent(entry.value) : parseTaka(entry.value)
      if (parsed.ok) inputs.push({ ownerId: entry.ownerId, value: parsed.value })
      else errors[`custom.${i}`] = parsed.error
    })
  }
  return {
    amount: amount.ok ? amount.value : undefined,
    splitInputs: isCustom(values.splitRule) ? inputs : null,
    errors,
  }
}

function ExpenseForm({
  expense,
  initialPhotos,
  defaults,
  owners,
  buildings,
  categories,
}: {
  expense: Expense | undefined
  initialPhotos: PhotoItem[]
  defaults: FormValues
  owners: Owner[]
  buildings: Building[]
  categories: ExpenseCategory[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const [photos, setPhotos] = useState(initialPhotos)
  const { register, control, handleSubmit, setValue, formState } = useForm<FormValues>({
    defaultValues: defaults,
  })
  const { dirtyFields } = formState
  const [buildingId, categoryId, meterId, period, isPaid, splitRule] = useWatch({
    control,
    name: ['buildingId', 'categoryId', 'meterId', 'period', 'isPaid', 'splitRule'],
  })
  const meters = useLiveQuery(() => listMeters(buildingId), [buildingId])
  const category = categories.find((c) => c.id === categoryId)
  const isMeterCategory = category?.kind === 'METER'
  const categoryOptions = categories.filter((c) => !c.isHidden || c.id === expense?.categoryId)
  const meterOptions = (meters ?? []).filter((m) => m.isActive || m.id === meterId)

  // A new expense takes the category's default split until the user picks one (D41).
  const onCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const chosen = categories.find((c) => c.id === event.target.value)
    if (!expense && chosen && !dirtyFields.splitRule) setValue('splitRule', chosen.defaultSplitRule)
  }

  const onSubmit = handleSubmit(async (values) => {
    const split = readSplit(values)
    if (hasErrors(split.errors) || split.amount === undefined) return setErrors(split.errors)
    const result = await saveExpense({
      id: expense?.id,
      buildingId: values.buildingId,
      categoryId: values.categoryId,
      meterId: isMeterCategory ? values.meterId || null : null,
      period: values.period,
      date: values.date,
      dueDate: expense?.dueDate ?? null,
      amount: split.amount,
      units: expense?.units ?? null,
      isPaid: values.isPaid,
      paidByOwnerId: values.paidByOwnerId || null,
      splitRule: values.splitRule,
      singleOwnerId: values.singleOwnerId || null,
      splitInputs: split.splitInputs,
      note: values.note,
      photos: photos.map(toPhotoInput),
    })
    if (!result.ok) return setErrors(result.errors)
    toast({ message: t('expenseForm.saved') })
    void navigate(`/expenses?month=${result.value.period}`, { replace: true })
  })

  return (
    <>
      <PageHeader
        title={expense ? t('expenseForm.editTitle') : t('expenseForm.newTitle')}
        back="/expenses"
      />
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <Field label={t('expenseForm.amount')} error={errors.amount}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            className="text-lg"
            {...register('amount')}
            aria-invalid={!!errors.amount}
          />
        </Field>
        <Field label={t('expenseForm.category')} error={errors.categoryId}>
          <Select
            {...register('categoryId', { onChange: onCategoryChange })}
            aria-invalid={!!errors.categoryId}
          >
            <option value="">{t('expenseForm.chooseCategory')}</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {(buildings.length > 1 || errors.buildingId) && (
          <Field label={t('expenseForm.building')} error={errors.buildingId}>
            <Select {...register('buildingId')} aria-invalid={!!errors.buildingId}>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isMeterCategory && (
          <Field label={t('expenseForm.meter')} error={errors.meterId}>
            <Select {...register('meterId')} aria-invalid={!!errors.meterId}>
              <option value="">{t('expenseForm.noMeter')}</option>
              {meterOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 items-start gap-3">
          <Field
            label={t('expenseForm.period')}
            error={errors.period}
            hint={t('expenseForm.periodHint')}
          >
            <Input type="month" {...register('period')} aria-invalid={!!errors.period} />
          </Field>
          <Field label={t('expenseForm.date')} error={errors.date}>
            <Input type="date" {...register('date')} aria-invalid={!!errors.date} />
          </Field>
        </div>

        <CheckboxField label={t('expenseForm.isPaid')} {...register('isPaid')} />
        {isPaid ? (
          <Field label={t('expenseForm.paidBy')} error={errors.paidByOwnerId}>
            <Select {...register('paidByOwnerId')} aria-invalid={!!errors.paidByOwnerId}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="-mt-2 text-sm text-muted-foreground">{t('expenseForm.unpaidHint')}</p>
        )}

        <Field
          label={t('expenseForm.splitRule')}
          error={errors.splitRule}
          errorParams={isPeriod(period) ? { month: formatPeriod(period) } : undefined}
        >
          <Select {...register('splitRule')} aria-invalid={!!errors.splitRule}>
            {EXPENSE_SPLIT_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {t(`splitRule.${rule}`)}
              </option>
            ))}
          </Select>
        </Field>
        {splitRule === 'SINGLE_OWNER' && (
          <Field label={t('expenseForm.singleOwner')} error={errors.singleOwnerId}>
            <Select {...register('singleOwnerId')} aria-invalid={!!errors.singleOwnerId}>
              <option value="">{t('shares.chooseOwner')}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isCustom(splitRule) && (
          <div className="grid grid-cols-2 items-start gap-3">
            {owners.map((owner, i) => (
              <Field
                key={owner.id}
                label={t(
                  splitRule === 'CUSTOM_PERCENT'
                    ? 'expenseForm.customPercent'
                    : 'expenseForm.customAmount',
                  { name: owner.name },
                )}
                error={errors[`custom.${i}`]}
              >
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  {...register(`custom.${i}.value`)}
                  aria-invalid={!!errors[`custom.${i}`]}
                />
              </Field>
            ))}
          </div>
        )}
        <ErrorText error={errors.splitInputs} />

        <SplitPreview control={control} owners={owners} />

        <Field label={t('common.optional', { label: t('expenseForm.note') })}>
          <Textarea {...register('note')} />
        </Field>
        <PhotoSlots photos={photos} onChange={setPhotos} error={errors.photos} />
        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
    </>
  )
}

/** Each owner's share of the amount as typed, from the same engine that saves it. */
function SplitPreview({ control, owners }: { control: Control<FormValues>; owners: Owner[] }) {
  const { t } = useTranslation()
  const [buildingId, period, amount, splitRule, singleOwnerId, custom] = useWatch({
    control,
    name: ['buildingId', 'period', 'amount', 'splitRule', 'singleOwnerId', 'custom'],
  })
  const shares = useLiveQuery(
    async () => (buildingId && isPeriod(period) ? resolveShares(buildingId, period) : null),
    [buildingId, period],
  )
  const split = readSplit({ amount, splitRule, custom })
  const names = new Map(owners.map((o) => [o.id, o.name]))

  const body = () => {
    if (splitRule === 'TENANT_PAID') return <p>{t('expenseForm.tenantPaid')}</p>
    if (needsShares(splitRule)) {
      if (shares === undefined) return null
      if (!shares?.ok)
        return (
          <p className="grid gap-1">
            <ErrorText
              error="errors.shares.noneForPeriod"
              params={isPeriod(period) ? { month: formatPeriod(period) } : undefined}
            />
            {buildingId && (
              <Link
                to={`/buildings/${buildingId}/shares`}
                className="font-medium text-primary underline underline-offset-4"
              >
                {t('expenseForm.setShares')}
              </Link>
            )}
          </p>
        )
    }
    if (split.amount === undefined || split.amount <= 0)
      return <p className="text-muted-foreground">{t('expenseForm.previewEmpty')}</p>

    const result = allocateExpense(
      {
        amount: split.amount,
        splitRule,
        singleOwnerId: singleOwnerId || null,
        splitInputs: split.splitInputs,
      },
      {
        shares: shares?.ok ? shares.value.owners : [],
        owners: owners.map((o) => ({ ownerId: o.id, sortOrder: o.sortOrder })),
      },
    )
    if (!result.ok) {
      const inputs = split.splitInputs ?? []
      return (
        <p className="grid gap-1">
          <ErrorText
            error={
              result.errors.splitInputs ?? result.errors.singleOwnerId ?? result.errors.splitRule
            }
          />
          {splitRule === 'CUSTOM_PERCENT' && (
            <span className="text-sm text-muted-foreground">
              {t('expenseForm.customTotalPercent', {
                total: formatBp(totalBp(inputs.map((i) => i.value))),
              })}
            </span>
          )}
          {splitRule === 'CUSTOM_AMOUNT' && (
            <span className="text-sm text-muted-foreground">
              {t('expenseForm.customTotalAmount', {
                total: formatTaka(sum(inputs.map((i) => poisha(i.value)))),
                amount: formatTaka(split.amount),
              })}
            </span>
          )}
        </p>
      )
    }
    return (
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {result.value.map((allocation) => (
          <div key={allocation.ownerId} className="contents">
            <dt>{names.get(allocation.ownerId)}</dt>
            <dd className="text-right tabular-nums">{formatTaka(allocation.amount)}</dd>
          </div>
        ))}
      </dl>
    )
  }

  return (
    <section aria-labelledby="split-preview" className="grid gap-2 rounded-lg border p-4">
      <h2 id="split-preview" className="font-semibold">
        {t('expenseForm.preview')}
      </h2>
      <div aria-live="polite">{body()}</div>
    </section>
  )
}
