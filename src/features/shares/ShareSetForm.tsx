import { Plus, X } from 'lucide-react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { BP_WHOLE, parsePercent } from '@/domain/bp'
import { isPeriod, type Period } from '@/domain/period'
import type { Owner, ShareSet } from '@/domain/types'
import { saveShareSet } from '@/services/shares'
import { Button } from '@/ui/components/button'
import { Input, Select } from '@/ui/components/input'
import { ErrorText, Field } from '@/ui/Field'
import { formatBp, formatPeriod, percentInputValue } from '@/ui/format'
import { useServiceErrors } from '@/ui/useServiceErrors'

interface ShareSetFormProps {
  buildingId: string
  owners: Owner[]
  /** Without an id, the form saves a new set prefilled with these values. */
  initial?: {
    id?: string | undefined
    effectiveFrom: Period
    methodNote: string | null
    entries: { ownerId: string; bp: number }[]
  }
  defaultPeriod: Period
  onSaved: (shareSet: ShareSet) => void
}

interface FormValues {
  effectiveFrom: string
  methodNote: string
  entries: { ownerId: string; percent: string }[]
}

/** Share set editor with a live total (AGENT.md section 9). Manual method only in Phase 1. */
export function ShareSetForm({
  buildingId,
  owners,
  initial,
  defaultPeriod,
  onSaved,
}: ShareSetFormProps) {
  const { t } = useTranslation()
  const { errors, setErrors } = useServiceErrors()
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    defaultValues: {
      effectiveFrom: initial?.effectiveFrom ?? defaultPeriod,
      methodNote: initial?.methodNote ?? '',
      entries: initial
        ? initial.entries.map((e) => ({ ownerId: e.ownerId, percent: percentInputValue(e.bp) }))
        : owners.map((o) => ({ ownerId: o.id, percent: owners.length === 1 ? '100' : '' })),
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'entries' })
  const entries = useWatch({ control, name: 'entries' })
  const effectiveFrom = useWatch({ control, name: 'effectiveFrom' })

  const total = entries.reduce((sum, e) => {
    const parsed = parsePercent(e.percent)
    return parsed.ok ? sum + parsed.value : sum
  }, 0)

  const onSubmit = handleSubmit(async (values) => {
    const rowErrors: Record<string, string> = {}
    const parsed = values.entries.map((entry, i) => {
      if (!entry.ownerId) rowErrors[`entries.${i}.ownerId`] = 'errors.shares.ownerRequired'
      const percent = parsePercent(entry.percent)
      if (!percent.ok) rowErrors[`entries.${i}.bp`] = percent.error
      return { ownerId: entry.ownerId, bp: percent.ok ? percent.value : 0 }
    })
    if (!isPeriod(values.effectiveFrom)) rowErrors.effectiveFrom = 'errors.period.invalid'
    if (Object.keys(rowErrors).length > 0 || !isPeriod(values.effectiveFrom)) {
      setErrors(rowErrors)
      return
    }
    const result = await saveShareSet({
      id: initial?.id,
      buildingId,
      effectiveFrom: values.effectiveFrom,
      methodNote: values.methodNote,
      entries: parsed,
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    onSaved(result.value)
  })

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
      <Field
        label={t('shares.effectiveFrom')}
        error={errors.effectiveFrom}
        hint={t('shares.effectiveFromHint')}
      >
        <Input type="month" {...register('effectiveFrom')} aria-invalid={!!errors.effectiveFrom} />
      </Field>

      <fieldset className="grid gap-3">
        <legend className="sr-only">{t('shares.percent')}</legend>
        {fields.map((field, i) => {
          const ownerName = owners.find((o) => o.id === entries[i]?.ownerId)?.name ?? ''
          return (
            <div key={field.id} className="grid gap-1">
              <div className="flex items-end gap-2">
                <Field label={t('shares.owner')} className="flex-1">
                  <Select
                    {...register(`entries.${i}.ownerId`)}
                    aria-invalid={!!errors[`entries.${i}.ownerId`]}
                  >
                    <option value="">{t('shares.chooseOwner')}</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('shares.percent')} className="w-28">
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    {...register(`entries.${i}.percent`)}
                    aria-invalid={!!errors[`entries.${i}.bp`]}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('shares.removeOwner', { name: ownerName })}
                  onClick={() => remove(i)}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <ErrorText error={errors[`entries.${i}.ownerId`] ?? errors[`entries.${i}.bp`]} />
            </div>
          )
        })}
        <Button variant="outline" onClick={() => append({ ownerId: '', percent: '' })}>
          <Plus aria-hidden />
          {t('shares.addOwner')}
        </Button>
      </fieldset>

      <p className="text-sm" aria-live="polite">
        <span className="font-medium">{t('shares.total', { total: formatBp(total) })}</span>
        {total !== BP_WHOLE && (
          <span className={total > BP_WHOLE ? 'text-destructive' : 'text-muted-foreground'}>
            {' · '}
            {total < BP_WHOLE
              ? t('shares.remaining', { remaining: formatBp(BP_WHOLE - total) })
              : t('shares.over', { over: formatBp(total - BP_WHOLE) })}
          </span>
        )}
      </p>
      <ErrorText
        error={errors.entries ?? errors.shareSet}
        params={isPeriod(effectiveFrom) ? { month: formatPeriod(effectiveFrom) } : undefined}
      />

      <Field label={t('common.optional', { label: t('shares.note') })}>
        <Input {...register('methodNote')} />
      </Field>

      <Button type="submit" disabled={formState.isSubmitting}>
        {t('common.save')}
      </Button>
    </form>
  )
}
