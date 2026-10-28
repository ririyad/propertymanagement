import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getExpense, listMeterExpenses } from '@/data/repositories/expenses'
import { getMeter } from '@/data/repositories/meters'
import { parseTaka } from '@/domain/money'
import { isPeriod } from '@/domain/period'
import type { Errors } from '@/domain/result'
import type { Expense, Meter, Owner } from '@/domain/types'
import { parseUnits } from '@/domain/units'
import { loadPhotoItems } from '@/features/shared/photoItems'
import { useOwners } from '@/features/shared/useLookups'
import { currentPeriod, todayInDhaka } from '@/services/clock'
import { saveMeterEntry } from '@/services/meterEntries'
import { Button } from '@/ui/components/button'
import { Input, Select, Textarea } from '@/ui/components/input'
import { CheckboxField, Field } from '@/ui/Field'
import { formatPeriod, takaInputValue } from '@/ui/format'
import { PageHeader } from '@/ui/PageHeader'
import { toPhotoInput, type PhotoItem } from '@/ui/photos'
import { PhotoSlots } from '@/ui/PhotoSlots'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/**
 * A postpaid bill or a prepaid recharge of a meter (`/meters/:meterId/entry`, or
 * `/meters/:meterId/entry/:expenseId` to edit one), AGENT.md 8.4, P1-T08.
 */
export function MeterEntryPage() {
  const { meterId = '', expenseId } = useParams()
  const owners = useOwners()
  const loaded = useLiveQuery(async () => {
    const meter = await getMeter(meterId)
    if (!meter || !isLive(meter) || meter.type === 'SUB') return null
    const expense = expenseId ? await getExpense(expenseId) : undefined
    if (expenseId && (!expense || !isLive(expense) || expense.meterId !== meter.id)) return null
    const photos = expense ? await loadPhotoItems('EXPENSE', expense.id) : []
    return { meter, expense, photos }
  }, [meterId, expenseId])
  if (!loaded || !owners) return null
  return (
    <EntryForm
      key={loaded.expense?.id ?? 'new'}
      meter={loaded.meter}
      expense={loaded.expense}
      initialPhotos={loaded.photos}
      owners={owners}
    />
  )
}

interface FormValues {
  period: string
  amount: string
  dueDate: string
  isPaid: boolean
  paidDate: string
  paidByOwnerId: string
  units: string
  note: string
}

function EntryForm({
  meter,
  expense,
  initialPhotos,
  owners,
}: {
  meter: Meter
  expense: Expense | undefined
  initialPhotos: PhotoItem[]
  owners: Owner[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const [photos, setPhotos] = useState(initialPhotos)
  const prepaid = meter.type === 'PREPAID'
  const tenantPays = meter.payer === 'TENANT'
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      period: expense?.period ?? currentPeriod(),
      amount: expense ? takaInputValue(expense.amount) : '',
      dueDate: expense?.dueDate ?? '',
      isPaid: expense?.isPaid ?? false,
      paidDate: expense && (prepaid || expense.isPaid) ? expense.date : todayInDhaka(),
      paidByOwnerId: expense?.paidByOwnerId ?? owners.find((o) => o.isPrimary)?.id ?? '',
      units: expense && expense.units !== null ? String(expense.units) : '',
      note: expense?.note ?? '',
    },
  })
  const [period, isPaid] = useWatch({ control, name: ['period', 'isPaid'] })
  const duplicate = useLiveQuery(
    async () =>
      !prepaid &&
      (await listMeterExpenses(meter.id)).some((e) => e.period === period && e.id !== expense?.id),
    [meter.id, period, expense?.id, prepaid],
  )
  const askPayer = !tenantPays && (prepaid || isPaid)

  const onSubmit = handleSubmit(async (values) => {
    const formErrors: Errors = {}
    const amount = parseTaka(values.amount)
    if (!amount.ok) formErrors.amount = amount.error
    const units = values.units.trim() === '' ? null : parseUnits(values.units)
    if (units && !units.ok) formErrors.units = units.error
    if (!amount.ok || (units && !units.ok)) return setErrors(formErrors)

    const result = await saveMeterEntry({
      id: expense?.id,
      meterId: meter.id,
      amount: amount.value,
      period: values.period,
      dueDate: values.dueDate,
      paidDate: prepaid || (isPaid && !tenantPays) ? values.paidDate : null,
      paidByOwnerId: askPayer ? values.paidByOwnerId : null,
      units: units?.value ?? null,
      note: values.note,
      photos: photos.map(toPhotoInput),
    })
    if (!result.ok) return setErrors(result.errors)
    toast({ message: prepaid ? t('meterEntry.rechargeSaved') : t('meterEntry.billSaved') })
    void navigate(`/meters/${meter.id}`, { replace: true })
  })

  const title = prepaid
    ? expense
      ? t('meterEntry.editRecharge')
      : t('meterEntry.newRecharge')
    : expense
      ? t('meterEntry.editBill')
      : t('meterEntry.newBill')
  return (
    <>
      <PageHeader title={title} back={`/meters/${meter.id}`} />
      <p className="-mt-2 mb-4 text-muted-foreground">{meter.label}</p>
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        {tenantPays && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">{t('meterEntry.tenantPays')}</p>
        )}
        {prepaid ? (
          <Field label={t('meterEntry.rechargeDate')} error={errors.paidDate}>
            <Input type="date" {...register('paidDate')} aria-invalid={!!errors.paidDate} />
          </Field>
        ) : (
          <Field label={t('meterEntry.billMonth')} error={errors.period}>
            <Input type="month" {...register('period')} aria-invalid={!!errors.period} />
          </Field>
        )}
        {duplicate && isPeriod(period) && (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
            {t('meterEntry.duplicate', { month: formatPeriod(period) })}
          </p>
        )}
        <Field
          label={t('meterEntry.amount')}
          error={errors.amount}
          hint={prepaid ? undefined : t('meterEntry.amountHint')}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            className="text-lg"
            {...register('amount')}
            aria-invalid={!!errors.amount}
          />
        </Field>
        {!prepaid && (
          <>
            <Field
              label={t('common.optional', { label: t('meterEntry.dueDate') })}
              error={errors.dueDate}
            >
              <Input type="date" {...register('dueDate')} aria-invalid={!!errors.dueDate} />
            </Field>
            {!tenantPays && (
              <CheckboxField label={t('meterEntry.isPaid')} {...register('isPaid')} />
            )}
            {isPaid && !tenantPays && (
              <Field label={t('meterEntry.paidOn')} error={errors.paidDate ?? errors.date}>
                <Input type="date" {...register('paidDate')} aria-invalid={!!errors.paidDate} />
              </Field>
            )}
          </>
        )}
        {askPayer && (
          <Field label={t('meterEntry.paidBy')} error={errors.paidByOwnerId}>
            <Select {...register('paidByOwnerId')} aria-invalid={!!errors.paidByOwnerId}>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!prepaid && (
          <Field
            label={t('common.optional', { label: t('meterEntry.units') })}
            error={errors.units}
          >
            <Input
              inputMode="numeric"
              autoComplete="off"
              {...register('units')}
              aria-invalid={!!errors.units}
            />
          </Field>
        )}
        <Field label={t('common.optional', { label: t('meterEntry.note') })}>
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
