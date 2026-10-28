import { useLiveQuery } from 'dexie-react-hooks'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getBuilding } from '@/data/repositories/buildings'
import { getMeter, listMeters } from '@/data/repositories/meters'
import type { ExpenseCategory, Meter, MeterPayer, MeterType } from '@/domain/types'
import { useCategories } from '@/features/shared/useLookups'
import { ELECTRICITY_CATEGORY_ID } from '@/services/categories'
import { METER_PAYERS, METER_TYPES, saveMeter } from '@/services/meters'
import { Button } from '@/ui/components/button'
import { Input, Select } from '@/ui/components/input'
import { CheckboxField, Field } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { useServiceErrors } from '@/ui/useServiceErrors'

/** Adds a meter to a building (`/buildings/:id/meters/new`) or edits one (`/meters/:meterId/edit`). */
export function MeterEditPage() {
  const { id, meterId } = useParams()
  const categories = useCategories()
  const loaded = useLiveQuery(async () => {
    const meter = meterId ? await getMeter(meterId) : undefined
    const buildingId = meter?.buildingId ?? id ?? ''
    const [building, meters] = await Promise.all([getBuilding(buildingId), listMeters(buildingId)])
    return { meter, building, meters }
  }, [id, meterId])
  if (!loaded?.building || !categories) return null
  if (meterId && !(loaded.meter && isLive(loaded.meter))) return null
  return (
    <MeterForm
      key={loaded.meter?.id ?? 'new'}
      buildingId={loaded.building.id}
      meter={loaded.meter}
      meters={loaded.meters}
      categories={categories}
    />
  )
}

interface FormValues {
  label: string
  meterNo: string
  type: MeterType
  payer: MeterPayer
  parentMeterId: string
  categoryId: string
  isActive: boolean
}

function MeterForm({
  buildingId,
  meter,
  meters,
  categories,
}: {
  buildingId: string
  meter: Meter | undefined
  meters: Meter[]
  categories: ExpenseCategory[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { errors, setErrors } = useServiceErrors()
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      label: meter?.label ?? '',
      meterNo: meter?.meterNo ?? '',
      type: meter?.type ?? 'POSTPAID',
      payer: meter?.payer ?? 'OWNERS',
      parentMeterId: meter?.parentMeterId ?? '',
      categoryId: meter?.categoryId ?? ELECTRICITY_CATEGORY_ID,
      isActive: meter?.isActive ?? true,
    },
  })
  const type = useWatch({ control, name: 'type' })
  const parents = meters.filter((m) => m.type !== 'SUB' && m.id !== meter?.id)
  const meterCategories = categories.filter(
    (c) => c.kind === 'METER' && (!c.isHidden || c.id === meter?.categoryId),
  )

  const onSubmit = handleSubmit(async (values) => {
    const result = await saveMeter({ id: meter?.id, buildingId, ...values })
    if (!result.ok) return setErrors(result.errors)
    void navigate(`/meters/${result.value.id}`, { replace: true })
  })

  return (
    <>
      <PageHeader
        title={meter ? t('meters.editTitle') : t('meters.new')}
        back={meter ? `/meters/${meter.id}` : `/buildings/${buildingId}/meters`}
      />
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <Field label={t('meter.label')} error={errors.label} hint={t('meter.labelHint')}>
          <Input {...register('label')} aria-invalid={!!errors.label} />
        </Field>
        <Field label={t('common.optional', { label: t('meter.meterNo') })}>
          <Input autoComplete="off" {...register('meterNo')} />
        </Field>
        <Field label={t('meter.type')} error={errors.type} hint={t('meter.typeHint')}>
          <Select {...register('type')} aria-invalid={!!errors.type}>
            {METER_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`meter.types.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'SUB' && (
          <Field
            label={t('meter.parent')}
            error={errors.parentMeterId}
            hint={t('meter.parentHint')}
          >
            <Select {...register('parentMeterId')} aria-invalid={!!errors.parentMeterId}>
              <option value="">{t('meter.noParent')}</option>
              {parents.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('meter.payer')} error={errors.payer} hint={t('meter.payerHint')}>
          <Select {...register('payer')} aria-invalid={!!errors.payer}>
            {METER_PAYERS.map((value) => (
              <option key={value} value={value}>
                {t(`meter.payers.${value}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('meter.category')} error={errors.categoryId}>
          <Select {...register('categoryId')} aria-invalid={!!errors.categoryId}>
            {meterCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {meter && <CheckboxField label={t('meter.isActive')} {...register('isActive')} />}
        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
    </>
  )
}
