import { useLiveQuery } from 'dexie-react-hooks'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { getOwner } from '@/data/repositories/owners'
import type { Owner } from '@/domain/types'
import { saveOwner } from '@/services/owners'
import { Button } from '@/ui/components/button'
import { Input, Textarea } from '@/ui/components/input'
import { Field } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { useServiceErrors } from '@/ui/useServiceErrors'

export function OwnerEditPage() {
  const { id } = useParams()
  const owner = useLiveQuery(async () => (id ? ((await getOwner(id)) ?? null) : null), [id])
  if (owner === undefined || (id && !owner)) return null
  return <OwnerForm key={owner?.id ?? 'new'} owner={owner ?? undefined} />
}

function OwnerForm({ owner }: { owner: Owner | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { errors, setErrors } = useServiceErrors()
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      name: owner?.name ?? '',
      phone: owner?.phone ?? '',
      relation: owner?.relation ?? '',
      note: owner?.note ?? '',
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    const result = await saveOwner({ id: owner?.id, ...values })
    if (!result.ok) return setErrors(result.errors)
    void navigate(`/owners/${result.value.id}`, { replace: true })
  })
  const back = owner ? `/owners/${owner.id}` : '/owners'

  return (
    <>
      <PageHeader title={owner ? t('owners.editTitle') : t('owners.new')} back={back} />
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <Field label={t('owner.name')} error={errors.name}>
          <Input {...register('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field label={t('common.optional', { label: t('owner.relation') })}>
          <Input {...register('relation')} />
        </Field>
        <Field label={t('common.optional', { label: t('owner.phone') })}>
          <Input type="tel" {...register('phone')} />
        </Field>
        <Field label={t('common.optional', { label: t('owner.note') })}>
          <Textarea {...register('note')} />
        </Field>
        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
    </>
  )
}
