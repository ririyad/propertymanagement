import { useLiveQuery } from 'dexie-react-hooks'
import { Gauge, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { listMeters, listTariffs } from '@/data/repositories/meters'
import { listReadings } from '@/data/repositories/readings'
import { computeReading } from '@/domain/meterBill'
import { isPeriod, type Period } from '@/domain/period'
import type { Errors } from '@/domain/result'
import type { Meter, MeterReading, Tariff } from '@/domain/types'
import { parseUnits } from '@/domain/units'
import { loadPhotoItems } from '@/features/shared/photoItems'
import { useBuildings } from '@/features/shared/useLookups'
import { currentPeriod, todayInDhaka } from '@/services/clock'
import {
  deleteReading,
  restoreReading,
  saveReadings,
  type ReadingEntryInput,
} from '@/services/readings'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Input, Select } from '@/ui/components/input'
import { EmptyState } from '@/ui/EmptyState'
import { CheckboxField, ErrorText, Field } from '@/ui/Field'
import { formatPeriod, formatTaka, formatUnits } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'
import { toPhotoInput, type PhotoItem } from '@/ui/photos'
import { PhotoSlots } from '@/ui/PhotoSlots'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

interface MeterRow {
  meter: Meter
  parent: Meter | undefined
  /** The meter's readings of other months, oldest first. */
  others: MeterReading[]
  tariffs: Tariff[]
  /** This month's reading, if one is saved. */
  current: MeterReading | undefined
  photos: PhotoItem[]
}

async function loadRows(buildingId: string, month: Period): Promise<MeterRow[]> {
  const meters = await listMeters(buildingId)
  const subMeters = meters.filter((m) => m.type === 'SUB' && m.isActive)
  return Promise.all(
    subMeters.map(async (meter) => {
      const [readings, tariffs] = await Promise.all([listReadings(meter.id), listTariffs(meter.id)])
      const current = readings.find((r) => r.period === month)
      return {
        meter,
        parent: meters.find((m) => m.id === meter.parentMeterId),
        others: readings.filter((r) => r !== current),
        tariffs,
        current,
        photos: current ? await loadPhotoItems('READING', current.id) : [],
      }
    }),
  )
}

/**
 * All sub meters of a building for one month, entered and saved at once (`/readings`, with
 * `?building=` and `?month=`), AGENT.md 8.4, P1-T09.
 */
export function ReadingsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const buildings = useBuildings()
  const monthParam = params.get('month') ?? ''
  const month = isPeriod(monthParam) ? monthParam : currentPeriod()
  const buildingId = params.get('building') ?? buildings?.[0]?.id ?? ''
  const rows = useLiveQuery(() => loadRows(buildingId, month), [buildingId, month])
  if (!buildings || !rows) return null

  const select = (next: { building?: string; month?: string }) =>
    setParams({ building: buildingId, month, ...next }, { replace: true })
  // Saving changes the readings, which starts the form again from what was saved.
  const saved = rows.map((r) => (r.current ? `${r.current.id}@${r.current.updatedAt}` : '')).join()

  return (
    <>
      <PageHeader title={t('readings.title')} back={`/buildings/${buildingId}`} />
      <div className="grid gap-4">
        <div className="grid grid-cols-2 items-start gap-3">
          {buildings.length > 1 && (
            <Field label={t('readings.building')} className="col-span-2">
              <Select value={buildingId} onChange={(e) => select({ building: e.target.value })}>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('readings.month')}>
            <Input
              type="month"
              value={month}
              onChange={(e) => isPeriod(e.target.value) && select({ month: e.target.value })}
            />
          </Field>
        </div>
        {!buildingId ? (
          <EmptyState
            icon={Gauge}
            title={t('buildings.empty')}
            description={t('buildings.emptyBody')}
            action={
              <Link to="/buildings/new" className={outlineLinkClass}>
                {t('buildings.add')}
              </Link>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title={t('readings.empty')}
            description={t('readings.emptyBody')}
            action={
              <Link to={`/buildings/${buildingId}/meters`} className={outlineLinkClass}>
                {t('readings.toMeters')}
              </Link>
            }
          />
        ) : (
          <ReadingsForm key={`${buildingId}:${month}:${saved}`} {...{ buildingId, month, rows }} />
        )}
      </div>
    </>
  )
}

interface RowValues {
  readingUnits: string
  isReset: boolean
  manualUnitsUsed: string
}

interface FormValues {
  readOn: string
  rows: RowValues[]
}

function ReadingsForm({
  buildingId,
  month,
  rows,
}: {
  buildingId: string
  month: Period
  rows: MeterRow[]
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const [photos, setPhotos] = useState(() => rows.map((r) => r.photos))
  const [photosChanged, setPhotosChanged] = useState(() => rows.map(() => false))
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      readOn: rows.find((r) => r.current)?.current?.readOn ?? todayInDhaka(),
      rows: rows.map(({ current }) => ({
        readingUnits: current ? String(current.readingUnits) : '',
        isReset: current?.isReset ?? false,
        manualUnitsUsed:
          current?.isReset && current.unitsUsed !== null ? String(current.unitsUsed) : '',
      })),
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    const formErrors: Errors = {}
    const entries: ReadingEntryInput[] = []
    const meterIds: string[] = []
    for (const [i, row] of rows.entries()) {
      const value = values.rows[i]
      // Saved readings that were not touched are left alone, so their bills stay as they are.
      const edited = !row.current || !!formState.dirtyFields.rows?.[i] || photosChanged[i]
      if (!value || value.readingUnits.trim() === '' || !edited) continue
      const id = row.meter.id
      const units = parseUnits(value.readingUnits)
      if (!units.ok) formErrors[`${id}.readingUnits`] = units.error
      const manual =
        value.isReset && value.manualUnitsUsed.trim() !== ''
          ? parseUnits(value.manualUnitsUsed)
          : null
      if (manual && !manual.ok) formErrors[`${id}.manualUnitsUsed`] = manual.error
      if (!units.ok || (manual && !manual.ok)) continue
      entries.push({
        meterId: id,
        readingUnits: units.value,
        isReset: value.isReset,
        manualUnitsUsed: manual?.value ?? null,
        photos: photosChanged[i] ? photos[i]?.map(toPhotoInput) : undefined,
      })
      meterIds.push(id)
    }
    if (Object.keys(formErrors).length > 0) return setErrors(formErrors)
    if (entries.length === 0) return setErrors({ form: 'errors.reading.nothingToSave' })

    const result = await saveReadings({ buildingId, period: month, readOn: values.readOn, entries })
    if (!result.ok) {
      // Entry errors come back as `entries.<i>.<field>`; rows show them by meter.
      const byMeter: Errors = {}
      for (const [key, error] of Object.entries(result.errors)) {
        const match = /^entries\.(\d+)\.(.+)$/.exec(key)
        byMeter[match ? `${meterIds[Number(match[1])]}.${match[2]}` : key] = error
      }
      return setErrors(byMeter)
    }
    toast({ message: t('readings.saved', { month: formatPeriod(month) }) })
  })

  const onDelete = async (reading: MeterReading) => {
    const result = await deleteReading(reading.id)
    if (!result.ok)
      return setErrors({ [`${reading.meterId}.reading`]: result.errors.reading ?? '' })
    toast({
      message: t('readings.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreReading(result.value) },
    })
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
      <ErrorText error={errors.period} />
      <Field label={t('readings.readOn')} error={errors.readOn}>
        <Input type="date" {...register('readOn')} aria-invalid={!!errors.readOn} />
      </Field>
      {rows.map((row, i) => (
        <ReadingRow
          key={row.meter.id}
          index={i}
          row={row}
          month={month}
          control={control}
          register={register}
          errors={errors}
          photos={photos[i] ?? []}
          onPhotos={(next) => {
            setPhotos((all) => all.map((p, j) => (j === i ? next : p)))
            setPhotosChanged((all) => all.map((c, j) => c || j === i))
          }}
          onDelete={(reading) => void onDelete(reading)}
        />
      ))}
      <ErrorText error={errors.form} />
      <Button type="submit" disabled={formState.isSubmitting}>
        {t('readings.save')}
      </Button>
    </form>
  )
}

const ROW_FIELDS = ['readingUnits', 'manualUnitsUsed', 'tariff']

function ReadingRow({
  index,
  row,
  month,
  control,
  register,
  errors,
  photos,
  onPhotos,
  onDelete,
}: {
  index: number
  row: MeterRow
  month: Period
  control: Control<FormValues>
  register: UseFormRegister<FormValues>
  errors: Errors
  photos: PhotoItem[]
  onPhotos: (photos: PhotoItem[]) => void
  onDelete: (reading: MeterReading) => void
}) {
  const { t } = useTranslation()
  const { meter, parent } = row
  const id = meter.id
  const values = useWatch({ control, name: `rows.${index}` })
  const previous = row.others.filter((r) => r.period < month).at(-1)
  const otherErrors = Object.entries(errors).filter(
    ([key]) => key.startsWith(`${id}.`) && !ROW_FIELDS.includes(key.slice(id.length + 1)),
  )
  const titleId = `meter-${id}`

  return (
    <Card className="p-4">
      <fieldset aria-labelledby={titleId} className="grid gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {meter.label}
          </h2>
          <p className="text-sm text-muted-foreground">
            {previous
              ? t('readings.previous', {
                  units: formatUnits(previous.readingUnits),
                  month: formatPeriod(previous.period),
                })
              : t('readings.first')}
          </p>
          {meter.payer === 'TENANT' ? (
            <p className="text-sm text-muted-foreground">{t('readings.tenantPays')}</p>
          ) : (
            parent && (
              <p className="text-sm text-muted-foreground">
                {t('readings.underParent', { parent: parent.label })}
              </p>
            )
          )}
        </div>
        <Field label={t('readings.reading')} error={errors[`${id}.readingUnits`]}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            className="text-lg"
            {...register(`rows.${index}.readingUnits`)}
            aria-invalid={!!errors[`${id}.readingUnits`]}
          />
        </Field>
        <CheckboxField label={t('readings.reset')} {...register(`rows.${index}.isReset`)} />
        {values.isReset && (
          <Field
            label={t('common.optional', { label: t('readings.manualUnits') })}
            hint={t('readings.manualUnitsHint')}
            error={errors[`${id}.manualUnitsUsed`]}
          >
            <Input
              inputMode="numeric"
              autoComplete="off"
              {...register(`rows.${index}.manualUnitsUsed`)}
              aria-invalid={!!errors[`${id}.manualUnitsUsed`]}
            />
          </Field>
        )}
        <Preview
          row={row}
          month={month}
          values={values}
          fieldError={errors[`${id}.readingUnits`] ?? errors[`${id}.manualUnitsUsed`]}
        />
        <PhotoSlots photos={photos} onChange={onPhotos} error={errors[`${id}.photos`]} compact />
        {otherErrors.map(([key, error]) => (
          <ErrorText key={key} error={error} />
        ))}
        {/* Only the latest reading can go: an earlier one starts the next bill. */}
        {row.current && !row.others.some((r) => r.period > month) && (
          <div>
            <Button variant="outline" onClick={() => row.current && onDelete(row.current)}>
              <Trash2 aria-hidden />
              {t('readings.delete')}
            </Button>
          </div>
        )}
      </fieldset>
    </Card>
  )
}

/** The bill the typed reading gives, worked out as the user types (AGENT.md 8.4, 8.5). */
function Preview({
  row,
  month,
  values,
  fieldError,
}: {
  row: MeterRow
  month: Period
  values: RowValues
  /** An error the reading's inputs already show after saving. */
  fieldError: string | undefined
}) {
  const { t } = useTranslation()
  const outcome = (() => {
    if (values.readingUnits.trim() === '') return undefined
    const units = parseUnits(values.readingUnits)
    const manual =
      values.isReset && values.manualUnitsUsed.trim() !== ''
        ? parseUnits(values.manualUnitsUsed)
        : null
    if (!units.ok || (manual && !manual.ok)) return undefined
    return computeReading(
      {
        period: month,
        readingUnits: units.value,
        isReset: values.isReset,
        manualUnitsUsed: manual?.value ?? null,
      },
      row.others,
      row.tariffs,
    )
  })()

  // The preview runs the same check as saving, so it also shows a missing tariff after a save.
  const noTariff = outcome && !outcome.ok ? outcome.errors.tariff : undefined
  if (noTariff)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ErrorText error={noTariff} />
        <Link to={`/meters/${row.meter.id}/tariffs/new`} className={outlineLinkClass}>
          {t('readings.addTariff')}
        </Link>
      </div>
    )
  if (!outcome) return null
  if (!outcome.ok) {
    const error = Object.values(outcome.errors)[0]
    return error === fieldError ? null : <ErrorText error={error} />
  }
  const result = outcome.value
  return (
    <output className="grid gap-1 rounded-md bg-muted px-3 py-2 text-sm">
      {result.kind === 'BASELINE' ? (
        <span>{t('readings.baseline')}</span>
      ) : (
        <>
          <span className="font-medium">
            {t('tariff.preview', {
              units: formatUnits(result.unitsUsed),
              amount: formatTaka(result.bill.total),
            })}
          </span>
          {result.monthsCovered > 1 && (
            <span>{t('readings.covers', { count: result.monthsCovered })}</span>
          )}
          {result.highUsage && (
            <span className="flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              {t('readings.highUsage')}
            </span>
          )}
        </>
      )}
    </output>
  )
}
