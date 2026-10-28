import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getBuilding } from '@/data/repositories/buildings'
import { getTemplate } from '@/data/repositories/recurring'
import { parseTaka } from '@/domain/money'
import type {
  ExpenseCategory,
  Frequency,
  Owner,
  RecurringTemplate,
  SplitRule,
} from '@/domain/types'
import { useCategories, useOwners } from '@/features/shared/useLookups'
import { CATEGORY_SPLIT_RULES } from '@/services/categories'
import { currentPeriod } from '@/services/clock'
import { deleteTemplate, FREQUENCIES, restoreTemplate, saveTemplate } from '@/services/recurring'
import { Button } from '@/ui/components/button'
import { Input, Select, Textarea } from '@/ui/components/input'
import { CheckboxField, ErrorText, Field } from '@/ui/Field'
import { takaInputValue } from '@/ui/format'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/**
 * Adds a recurring cost to a building (`/buildings/:id/templates/new`) or edits one
 * (`/templates/:templateId/edit`), AGENT.md 7.4, 8.6.
 */
export function TemplateEditPage() {
  const { id, templateId } = useParams()
  const categories = useCategories()
  const owners = useOwners()
  const loaded = useLiveQuery(async () => {
    const template = templateId ? await getTemplate(templateId) : undefined
    const building = await getBuilding(template?.buildingId ?? id ?? '')
    return { template, building }
  }, [id, templateId])
  if (!loaded?.building || !categories || !owners) return null
  if (templateId && !(loaded.template && isLive(loaded.template))) return null
  return (
    <TemplateForm
      key={loaded.template?.id ?? 'new'}
      buildingId={loaded.building.id}
      template={loaded.template}
      categories={categories}
      owners={owners}
    />
  )
}

interface FormValues {
  categoryId: string
  amount: string
  frequency: Frequency
  startPeriod: string
  endPeriod: string
  dueDay: string
  defaultPaidByOwnerId: string
  splitRule: SplitRule
  isActive: boolean
  note: string
}

function TemplateForm({
  buildingId,
  template,
  categories,
  owners,
}: {
  buildingId: string
  template: RecurringTemplate | undefined
  categories: ExpenseCategory[]
  owners: Owner[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const choices = categories.filter(
    (c) => c.kind !== 'METER' && (!c.isHidden || c.id === template?.categoryId),
  )
  const firstChoice = choices.find((c) => c.kind === 'RECURRING') ?? choices[0]
  const { register, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      categoryId: template?.categoryId ?? firstChoice?.id ?? '',
      amount: template ? takaInputValue(template.amount) : '',
      frequency: template?.frequency ?? 'MONTHLY',
      startPeriod: template?.startPeriod ?? currentPeriod(),
      endPeriod: template?.endPeriod ?? '',
      dueDay: String(template?.dueDay ?? 1),
      defaultPaidByOwnerId: template?.defaultPaidByOwnerId ?? '',
      splitRule: template?.splitRule ?? firstChoice?.defaultSplitRule ?? 'BY_SHARE',
      isActive: template ? template.isActive === 1 : true,
      note: template?.note ?? '',
    },
  })
  const back = `/buildings/${buildingId}/templates`

  const onSubmit = handleSubmit(async (values) => {
    const amount = parseTaka(values.amount)
    if (!amount.ok) return setErrors({ amount: amount.error })
    const result = await saveTemplate({
      ...values,
      id: template?.id,
      buildingId,
      amount: amount.value,
      dueDay: /^\d+$/.test(values.dueDay.trim()) ? Number(values.dueDay) : Number.NaN,
    })
    if (!result.ok) return setErrors(result.errors)
    toast({ message: t('recurring.saved') })
    void navigate(back, { replace: true })
  })

  const onDelete = async () => {
    if (!template) return
    const result = await deleteTemplate(template.id)
    if (!result.ok) return setErrors(result.errors)
    void navigate(back, { replace: true })
    toast({
      message: t('recurring.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreTemplate(result.value) },
    })
  }

  return (
    <>
      <PageHeader title={template ? t('recurring.editTitle') : t('recurring.new')} back={back} />
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <Field label={t('recurring.category')} error={errors.categoryId}>
          <Select {...register('categoryId')} aria-invalid={!!errors.categoryId}>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('recurring.amount')} error={errors.amount}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            className="text-lg"
            {...register('amount')}
            aria-invalid={!!errors.amount}
          />
        </Field>
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label={t('recurring.frequency')} error={errors.frequency}>
            <Select {...register('frequency')} aria-invalid={!!errors.frequency}>
              {FREQUENCIES.map((value) => (
                <option key={value} value={value}>
                  {t(`recurring.frequencies.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('recurring.dueDay')} error={errors.dueDay}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              {...register('dueDay')}
              aria-invalid={!!errors.dueDay}
            />
          </Field>
          <Field label={t('recurring.startPeriod')} error={errors.startPeriod}>
            <Input type="month" {...register('startPeriod')} aria-invalid={!!errors.startPeriod} />
          </Field>
          <Field
            label={t('common.optional', { label: t('recurring.endPeriod') })}
            error={errors.endPeriod}
          >
            <Input type="month" {...register('endPeriod')} aria-invalid={!!errors.endPeriod} />
          </Field>
        </div>
        <Field
          label={t('recurring.paidBy')}
          error={errors.defaultPaidByOwnerId}
          hint={t('recurring.paidByHint')}
        >
          <Select
            {...register('defaultPaidByOwnerId')}
            aria-invalid={!!errors.defaultPaidByOwnerId}
          >
            <option value="">{t('recurring.notPaid')}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('recurring.splitRule')} error={errors.splitRule}>
          <Select {...register('splitRule')} aria-invalid={!!errors.splitRule}>
            {CATEGORY_SPLIT_RULES.map((value) => (
              <option key={value} value={value}>
                {t(`splitRule.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.optional', { label: t('recurring.note') })}>
          <Textarea {...register('note')} />
        </Field>
        {template && <CheckboxField label={t('recurring.isActive')} {...register('isActive')} />}
        <p className="text-sm text-muted-foreground">{t('recurring.draftsHint')}</p>
        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
      {template && (
        <div className="mt-6">
          <Button variant="outline" onClick={() => void onDelete()}>
            <Trash2 aria-hidden />
            {t('common.delete')}
          </Button>
          <ErrorText error={errors.template} />
        </div>
      )}
    </>
  )
}
