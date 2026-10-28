import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, X } from 'lucide-react'
import { Fragment } from 'react'
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getMeter, latestSiblingTariff, listTariffs } from '@/data/repositories/meters'
import { poisha } from '@/domain/money'
import { addMonths, isPeriod } from '@/domain/period'
import { computeBill } from '@/domain/tariff'
import type { Meter, Tariff } from '@/domain/types'
import { parseUnits } from '@/domain/units'
import { currentPeriod } from '@/services/clock'
import { deleteTariff, restoreTariff, saveTariff } from '@/services/meters'
import { Button } from '@/ui/components/button'
import { Input, Select } from '@/ui/components/input'
import { CheckboxField, ErrorText, Field } from '@/ui/Field'
import { formatTaka } from '@/ui/format'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'
import { parseTariffForm, tariffFormValues, type TariffFormValues } from './tariffForm'

/**
 * Edits a sub meter's tariff, or adds one. A new tariff starts from the meter's newest tariff (a
 * month after it, if that starts this month or later), or else copies another sub meter's.
 */
export function TariffEditPage() {
  const { meterId = '', tariffId } = useParams()
  const loaded = useLiveQuery(async () => {
    const meter = await getMeter(meterId)
    if (!meter || !isLive(meter)) return {}
    const tariffs = await listTariffs(meter.id)
    if (tariffId) return { meter, tariff: tariffs.find((t) => t.id === tariffId) }
    const sibling = tariffs.length === 0 ? await latestSiblingTariff(meter) : undefined
    return { meter, newest: tariffs[0], sibling }
  }, [meterId, tariffId])
  if (!loaded?.meter) return null
  const { meter, tariff, newest, sibling } = loaded
  if (tariffId && !tariff) return <Navigate to={`/meters/${meter.id}`} replace />

  const now = currentPeriod()
  const initial = tariff
    ? tariffFormValues(tariff, tariff.effectiveFrom)
    : newest
      ? tariffFormValues(
          newest,
          newest.effectiveFrom >= now ? addMonths(newest.effectiveFrom, 1) : now,
        )
      : sibling
        ? tariffFormValues(sibling.tariff, sibling.tariff.effectiveFrom)
        : tariffFormValues(undefined, now)
  return (
    <TariffForm
      key={tariff?.id ?? 'new'}
      meter={meter}
      tariff={tariff}
      initial={initial}
      copiedFrom={newest ? undefined : sibling?.meter.label}
    />
  )
}

type FormValues = TariffFormValues & { previewUnits: string }

function TariffForm({
  meter,
  tariff,
  initial,
  copiedFrom,
}: {
  meter: Meter
  tariff: Tariff | undefined
  initial: TariffFormValues
  copiedFrom: string | undefined
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: { ...initial, previewUnits: '100' },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'slabs' })
  const [mode, slabs] = useWatch({ control, name: ['mode', 'slabs'] })

  const onSubmit = handleSubmit(async (values) => {
    const parsed = parseTariffForm(values)
    const formErrors = parsed.ok ? {} : { ...parsed.errors }
    if (!isPeriod(values.effectiveFrom)) formErrors.effectiveFrom = 'errors.period.invalid'
    if (!parsed.ok || !isPeriod(values.effectiveFrom)) return setErrors(formErrors)
    const result = await saveTariff({
      id: tariff?.id,
      meterId: meter.id,
      effectiveFrom: values.effectiveFrom,
      ...parsed.rates,
    })
    if (!result.ok) return setErrors(result.errors)
    void navigate(`/meters/${meter.id}`, { replace: true })
  })

  const onDelete = async () => {
    if (!tariff) return
    const result = await deleteTariff(tariff.id)
    if (!result.ok) return setErrors(result.errors)
    void navigate(`/meters/${meter.id}`, { replace: true })
    toast({
      message: t('tariff.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreTariff(tariff.id) },
    })
  }

  return (
    <>
      <PageHeader
        title={tariff ? t('tariff.editTitle') : t('tariff.newTitle')}
        back={`/meters/${meter.id}`}
      />
      <p className="-mt-2 mb-4 text-muted-foreground">{meter.label}</p>
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        {copiedFrom && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {t('tariff.copiedFrom', { meter: copiedFrom })}
          </p>
        )}
        <Field
          label={t('tariff.effectiveFrom')}
          error={errors.effectiveFrom}
          hint={t('tariff.effectiveFromHint')}
        >
          <Input
            type="month"
            {...register('effectiveFrom')}
            aria-invalid={!!errors.effectiveFrom}
          />
        </Field>
        <Field label={t('tariff.mode')}>
          <Select {...register('mode')}>
            <option value="FLAT">{t('tariff.modes.FLAT')}</option>
            <option value="SLAB">{t('tariff.modes.SLAB')}</option>
          </Select>
        </Field>

        {mode === 'FLAT' ? (
          <Field label={t('tariff.flatRate')} error={errors.flatRate}>
            <Input
              inputMode="decimal"
              autoComplete="off"
              {...register('flatRate')}
              aria-invalid={!!errors.flatRate}
            />
          </Field>
        ) : (
          <>
            <Field label={t('tariff.slabMode')} error={errors.slabMode}>
              <Select {...register('slabMode')}>
                <option value="PROGRESSIVE">{t('tariff.slabModes.PROGRESSIVE')}</option>
                <option value="SINGLE_BAND">{t('tariff.slabModes.SINGLE_BAND')}</option>
              </Select>
            </Field>
            {fields.map((field, i) => {
              const isLast = i === fields.length - 1
              const upToError = errors[`slabs.${i}.upToUnits`]
              const rateError = errors[`slabs.${i}.rate`]
              return (
                <div
                  key={field.id}
                  role="group"
                  aria-label={t('tariff.slab', { number: i + 1 })}
                  className="grid gap-1"
                >
                  <div className="flex items-end gap-2">
                    {isLast ? (
                      <p className="flex min-h-12 flex-1 items-center text-muted-foreground">
                        {i === 0
                          ? t('tariff.slabAll')
                          : t('tariff.slabAbove', { units: slabs[i - 1]?.upTo || '…' })}
                      </p>
                    ) : (
                      <Field label={t('tariff.slabUpTo')} className="flex-1">
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          {...register(`slabs.${i}.upTo`)}
                          aria-invalid={!!upToError}
                        />
                      </Field>
                    )}
                    <Field label={t('tariff.slabRate')} className="w-28">
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        {...register(`slabs.${i}.rate`)}
                        aria-invalid={!!rateError}
                      />
                    </Field>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={fields.length === 1}
                      aria-label={t('tariff.removeSlab', { number: i + 1 })}
                      onClick={() => remove(i)}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                  <ErrorText error={upToError ?? rateError} />
                </div>
              )
            })}
            <Button variant="outline" onClick={() => append({ upTo: '', rate: '' })}>
              <Plus aria-hidden />
              {t('tariff.addSlab')}
            </Button>
            <ErrorText error={errors.slabs} />
          </>
        )}

        <Field
          label={t('tariff.fixedCharge')}
          error={errors.fixedChargeMonthly}
          hint={t('tariff.fixedChargeHint')}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            {...register('fixedCharge')}
            aria-invalid={!!errors.fixedChargeMonthly}
          />
        </Field>
        <Field label={t('tariff.vat')} error={errors.vatBp}>
          <Input
            inputMode="decimal"
            autoComplete="off"
            {...register('vat')}
            aria-invalid={!!errors.vatBp}
          />
        </Field>
        <CheckboxField label={t('tariff.vatOnFixed')} {...register('vatOnFixed')} />

        <BillPreview control={control} register={register} />

        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
      {tariff && (
        <div className="mt-6">
          <Button variant="outline" onClick={() => void onDelete()}>
            <Trash2 aria-hidden />
            {t('common.delete')}
          </Button>
          <ErrorText error={errors.tariff} />
        </div>
      )}
    </>
  )
}

/** The bill for a number of units under the rates as typed (AGENT.md section 9). */
function BillPreview({
  control,
  register,
}: {
  control: Control<FormValues>
  register: UseFormRegister<FormValues>
}) {
  const { t } = useTranslation()
  const [mode, flatRate, slabMode, slabs, fixedCharge, vat, vatOnFixed, previewUnits] = useWatch({
    control,
    name: [
      'mode',
      'flatRate',
      'slabMode',
      'slabs',
      'fixedCharge',
      'vat',
      'vatOnFixed',
      'previewUnits',
    ],
  })
  const parsed = parseTariffForm({
    effectiveFrom: '',
    mode,
    flatRate,
    slabMode,
    slabs,
    fixedCharge,
    vat,
    vatOnFixed,
  })
  const units = parseUnits(previewUnits)
  const bill = parsed.ok && units.ok ? computeBill(parsed.rates, units.value) : undefined

  return (
    <section aria-labelledby="bill-preview" className="grid gap-3 rounded-lg border p-4">
      <h2 id="bill-preview" className="font-semibold">
        {t('tariff.previewTitle')}
      </h2>
      <Field label={t('tariff.previewUnits')}>
        <Input inputMode="numeric" autoComplete="off" {...register('previewUnits')} />
      </Field>
      <output aria-live="polite" className="grid gap-2">
        {bill ? (
          <>
            <span className="text-lg font-semibold">
              {t('tariff.preview', { units: bill.units, amount: formatTaka(bill.total) })}
            </span>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {bill.lines.map((line, i) => (
                <Fragment key={i}>
                  <dt>
                    {t('tariff.line', { units: line.units, rate: formatTaka(poisha(line.rate)) })}
                  </dt>
                  <dd className="text-right tabular-nums">{formatTaka(line.amount)}</dd>
                </Fragment>
              ))}
              {bill.fixed > 0 && (
                <>
                  <dt>{t('tariff.fixedLine')}</dt>
                  <dd className="text-right tabular-nums">{formatTaka(bill.fixed)}</dd>
                </>
              )}
              {bill.vat > 0 && (
                <>
                  <dt>{t('tariff.vatLine')}</dt>
                  <dd className="text-right tabular-nums">{formatTaka(bill.vat)}</dd>
                </>
              )}
            </dl>
          </>
        ) : (
          <span className="text-muted-foreground">{t('tariff.previewIncomplete')}</span>
        )}
      </output>
    </section>
  )
}
