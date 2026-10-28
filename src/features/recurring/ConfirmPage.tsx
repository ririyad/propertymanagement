import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { listDrafts } from '@/data/repositories/recurring'
import { parseTaka } from '@/domain/money'
import { isPeriod } from '@/domain/period'
import type { Errors } from '@/domain/result'
import type { Expense, Owner } from '@/domain/types'
import { useBuildings, useCategories, useOwners } from '@/features/shared/useLookups'
import { currentPeriod } from '@/services/clock'
import { skipDraft, unskipDraft } from '@/services/expenses'
import { confirmDrafts, type ConfirmInput } from '@/services/recurring'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Input, Select } from '@/ui/components/input'
import { EmptyState } from '@/ui/EmptyState'
import { CheckboxField, ErrorText, Field } from '@/ui/Field'
import { formatDate, formatPeriod, takaInputValue } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/**
 * The drafts of a month from recurring costs, to confirm or skip one by one or all at once
 * (`/confirm?month=`), AGENT.md 8.6 rule 4, P1-T10.
 */
export function ConfirmPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const monthParam = params.get('month') ?? ''
  const month = isPeriod(monthParam) ? monthParam : currentPeriod()
  const drafts = useLiveQuery(listDrafts, [])
  const owners = useOwners()
  if (!drafts || !owners) return null

  const shown = drafts.filter((d) => d.period === month)
  const earlier = drafts.filter((d) => d.period < month)
  return (
    <>
      <PageHeader title={t('confirm.title')} back="/expenses" />
      <div className="grid gap-4">
        <Field label={t('confirm.month')} className="w-1/2">
          <Input
            type="month"
            value={month}
            onChange={(e) =>
              isPeriod(e.target.value) && setParams({ month: e.target.value }, { replace: true })
            }
          />
        </Field>
        {earlier[0] && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted px-3 py-2">
            {t('confirm.earlier', { count: earlier.length })}
            <Link to={`/confirm?month=${earlier[0].period}`} className={outlineLinkClass} replace>
              {t('confirm.showMonth', { month: formatPeriod(earlier[0].period) })}
            </Link>
          </p>
        )}
        {shown.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title={t('confirm.empty', { month: formatPeriod(month) })}
            description={t('confirm.emptyBody')}
            action={
              <Link to="/expenses" className={outlineLinkClass}>
                {t('confirm.toExpenses')}
              </Link>
            }
          />
        ) : (
          <DraftsForm key={month} drafts={shown} owners={owners} />
        )}
      </div>
    </>
  )
}

interface RowValues {
  amount: string
  isPaid: boolean
  paidByOwnerId: string
  useFromNowOn: boolean
}

type FormValues = { rows: Record<string, RowValues> }

const rowValues = (draft: Expense, owners: Owner[]): RowValues => ({
  amount: takaInputValue(draft.amount),
  isPaid: draft.isPaid,
  paidByOwnerId: draft.paidByOwnerId ?? owners.find((o) => o.isPrimary)?.id ?? '',
  useFromNowOn: false,
})

function DraftsForm({ drafts, owners }: { drafts: Expense[]; owners: Owner[] }) {
  const { t } = useTranslation()
  const toast = useToast()
  const buildings = useBuildings()
  const categories = useCategories()
  const { errors, setErrors } = useServiceErrors()
  // Rows are keyed by draft id; a draft that leaves the list keeps its unused values.
  const [busy, setBusy] = useState(false)
  const { register, control, getValues } = useForm<FormValues>({
    defaultValues: { rows: Object.fromEntries(drafts.map((d) => [d.id, rowValues(d, owners)])) },
  })
  const categoryName = (draft: Expense) =>
    categories?.find((c) => c.id === draft.categoryId)?.name ?? ''

  const confirm = async (list: Expense[]) => {
    const inputErrors: Errors = {}
    const inputs: ConfirmInput[] = []
    for (const draft of list) {
      const values = getValues(`rows.${draft.id}`)
      const amount = parseTaka(values.amount)
      if (!amount.ok) inputErrors[`${draft.id}.amount`] = amount.error
      else
        inputs.push({
          id: draft.id,
          amount: amount.value,
          isPaid: values.isPaid,
          paidByOwnerId: values.isPaid ? values.paidByOwnerId : null,
          useFromNowOn: values.useFromNowOn,
        })
    }
    if (Object.keys(inputErrors).length > 0) return setErrors(inputErrors)
    setBusy(true)
    const failed = await confirmDrafts(inputs).finally(() => setBusy(false))
    setErrors(failed)
    const done = inputs.filter((i) => !Object.keys(failed).some((k) => k.startsWith(`${i.id}.`)))
    if (done.length === 1 && list.length === 1 && list[0])
      toast({ message: t('confirm.confirmed', { name: categoryName(list[0]) }) })
    else if (done.length > 0) toast({ message: t('confirm.confirmedMany', { count: done.length }) })
  }

  const skip = async (draft: Expense) => {
    const result = await skipDraft(draft.id)
    if (!result.ok) return setErrors({ [`${draft.id}.expense`]: result.errors.expense ?? '' })
    toast({
      message: t('confirm.skipped', { name: categoryName(draft) }),
      action: { label: t('common.undo'), onClick: () => void unskipDraft(draft.id) },
    })
  }

  const multipleBuildings = new Set(drafts.map((d) => d.buildingId)).size > 1
  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4" noValidate>
      {drafts.map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          name={categoryName(draft)}
          building={
            multipleBuildings ? buildings?.find((b) => b.id === draft.buildingId)?.name : undefined
          }
          owners={owners}
          control={control}
          register={register}
          errors={errors}
          busy={busy}
          onConfirm={() => void confirm([draft])}
          onSkip={() => void skip(draft)}
        />
      ))}
      {drafts.length > 1 && (
        <Button onClick={() => void confirm(drafts)} disabled={busy}>
          {t('confirm.confirmAll')}
        </Button>
      )}
    </form>
  )
}

function DraftRow({
  draft,
  name,
  building,
  owners,
  control,
  register,
  errors,
  busy,
  onConfirm,
  onSkip,
}: {
  draft: Expense
  name: string
  building: string | undefined
  owners: Owner[]
  control: Control<FormValues>
  register: UseFormRegister<FormValues>
  errors: Errors
  busy: boolean
  onConfirm: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const id = draft.id
  const isPaid = useWatch({ control, name: `rows.${id}.isPaid` })
  const titleId = `draft-${id}`
  const rowErrors = Object.entries(errors).filter(
    ([key]) =>
      key.startsWith(`${id}.`) && !['amount', 'paidByOwnerId'].includes(key.slice(id.length + 1)),
  )
  return (
    <Card className="p-4">
      <fieldset aria-labelledby={titleId} className="grid gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {[
              building,
              t('confirm.due', { date: formatDate(draft.date) }),
              t(`splitRule.${draft.splitRule}`),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {draft.note && <p className="text-sm text-muted-foreground">{draft.note}</p>}
        </div>
        <Field label={t('confirm.amount')} error={errors[`${id}.amount`]}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            className="text-lg"
            {...register(`rows.${id}.amount`)}
            aria-invalid={!!errors[`${id}.amount`]}
          />
        </Field>
        {draft.templateId && (
          <CheckboxField
            label={t('confirm.useFromNowOn')}
            {...register(`rows.${id}.useFromNowOn`)}
          />
        )}
        <CheckboxField label={t('confirm.isPaid')} {...register(`rows.${id}.isPaid`)} />
        {isPaid && (
          <Field label={t('confirm.paidBy')} error={errors[`${id}.paidByOwnerId`]}>
            <Select
              {...register(`rows.${id}.paidByOwnerId`)}
              aria-invalid={!!errors[`${id}.paidByOwnerId`]}
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {rowErrors.map(([key, error]) => (
          <ErrorText key={key} error={error} params={{ month: formatPeriod(draft.period) }} />
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onSkip} disabled={busy}>
            {t('confirm.skip')}
          </Button>
          <Button variant="secondary" onClick={onConfirm} disabled={busy}>
            {t('confirm.confirm')}
          </Button>
        </div>
      </fieldset>
    </Card>
  )
}
