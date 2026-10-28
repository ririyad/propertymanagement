import { useLiveQuery } from 'dexie-react-hooks'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { db } from '@/data/db'
import { getBuilding, listBuildingGroups } from '@/data/repositories/buildings'
import type { Building } from '@/domain/types'
import { saveBuilding } from '@/services/buildings'
import { Button } from '@/ui/components/button'
import { Input, Textarea } from '@/ui/components/input'
import { Field } from '@/ui/Field'
import { PageHeader } from '@/ui/PageHeader'
import { useServiceErrors } from '@/ui/useServiceErrors'

export function BuildingEditPage() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => {
    const building = id ? await getBuilding(id) : undefined
    const group = building?.groupId ? await db.buildingGroup.get(building.groupId) : undefined
    return { building, groupName: group?.name ?? '', groups: await listBuildingGroups() }
  }, [id])
  if (!loaded || (id && !loaded.building)) return null
  return (
    <BuildingForm
      key={loaded.building?.id ?? 'new'}
      building={loaded.building}
      groupName={loaded.groupName}
      groupNames={loaded.groups.map((g) => g.name)}
    />
  )
}

function BuildingForm({
  building,
  groupName,
  groupNames,
}: {
  building: Building | undefined
  groupName: string
  groupNames: string[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { errors, setErrors } = useServiceErrors()
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      name: building?.name ?? '',
      address: building?.address ?? '',
      groupName,
      note: building?.note ?? '',
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    const result = await saveBuilding({ id: building?.id, ...values })
    if (!result.ok) return setErrors(result.errors)
    void navigate(`/buildings/${result.value.id}`, { replace: true })
  })

  return (
    <>
      <PageHeader
        title={building ? t('buildings.editTitle') : t('buildings.new')}
        back={building ? `/buildings/${building.id}` : '/buildings'}
      />
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        <Field label={t('building.name')} error={errors.name}>
          <Input {...register('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field label={t('common.optional', { label: t('building.address') })}>
          <Input autoComplete="street-address" {...register('address')} />
        </Field>
        <Field
          label={t('common.optional', { label: t('building.group') })}
          hint={t('building.groupHint')}
        >
          <Input list="building-groups" autoComplete="off" {...register('groupName')} />
        </Field>
        <datalist id="building-groups">
          {groupNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Field label={t('common.optional', { label: t('building.note') })}>
          <Textarea {...register('note')} />
        </Field>
        <Button type="submit" disabled={formState.isSubmitting}>
          {t('common.save')}
        </Button>
      </form>
    </>
  )
}
