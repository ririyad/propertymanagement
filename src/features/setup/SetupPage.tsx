import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, Check, Smartphone, User } from 'lucide-react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { listShareSets } from '@/data/repositories/shares'
import type { Building, Owner } from '@/domain/types'
import { useBuildings, useOwners } from '@/features/shared/useLookups'
import { ShareSetForm } from '@/features/shares/ShareSetForm'
import { currentPeriod } from '@/services/clock'
import { saveBuilding } from '@/services/buildings'
import { saveOwner } from '@/services/owners'
import { completeSetup } from '@/services/setup'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { Input } from '@/ui/components/input'
import { Field } from '@/ui/Field'
import { formatPeriod } from '@/ui/format'
import { useServiceErrors } from '@/ui/useServiceErrors'

const STEPS = ['profile', 'buildings', 'owners', 'shares', 'done'] as const
type Step = (typeof STEPS)[number]

/** First-launch wizard (AGENT.md section 9, P1-T01). Every step saves as it goes. */
export function SetupPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const step: Step = STEPS.find((s) => s === params.get('step')) ?? 'profile'
  const index = STEPS.indexOf(step)
  const next = () => setParams({ step: STEPS[index + 1] ?? 'done' })

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-12">
      <title>{t('app.pageTitle', { page: t('setup.title') })}</title>
      <p className="text-sm text-muted-foreground">
        {t('setup.step', { step: index + 1, total: STEPS.length })}
      </p>
      {step === 'profile' && <ProfileStep onDone={next} />}
      {step === 'buildings' && <BuildingsStep onDone={next} />}
      {step === 'owners' && <OwnersStep onDone={next} />}
      {step === 'shares' && <SharesStep onDone={next} />}
      {step === 'done' && <DoneStep />}
    </div>
  )
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <header className="pt-1 pb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted-foreground">{body}</p>
    </header>
  )
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const owners = useOwners()
  const primary = owners?.find((o) => o.isPrimary)
  if (owners === undefined) return null
  return (
    <>
      <StepHeading title={t('setup.profile.title')} body={t('setup.profile.body')} />
      <OwnerForm key={primary?.id ?? 'new'} owner={primary} isPrimary onSaved={onDone} />
      <p className="mt-8 text-sm text-muted-foreground">
        {t('setup.restoreHint')}{' '}
        <Link to="/backup" className="font-medium text-primary underline underline-offset-4">
          {t('setup.restoreLink')}
        </Link>
      </p>
    </>
  )
}

function OwnerForm({
  owner,
  isPrimary = false,
  onSaved,
  submitLabel,
}: {
  owner?: Owner | undefined
  isPrimary?: boolean
  onSaved: () => void
  submitLabel?: string
}) {
  const { t } = useTranslation()
  const { errors, setErrors } = useServiceErrors()
  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: {
      name: owner?.name ?? '',
      phone: owner?.phone ?? '',
      relation: owner?.relation ?? '',
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    const result = await saveOwner({ id: owner?.id, ...values, isPrimary: isPrimary || undefined })
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    if (!owner) reset()
    onSaved()
  })
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
      <Field label={t('owner.name')} error={errors.name}>
        <Input autoComplete="name" {...register('name')} aria-invalid={!!errors.name} />
      </Field>
      {isPrimary ? (
        <Field label={t('common.optional', { label: t('owner.phone') })}>
          <Input type="tel" autoComplete="tel" {...register('phone')} />
        </Field>
      ) : (
        <Field label={t('common.optional', { label: t('owner.relation') })}>
          <Input {...register('relation')} />
        </Field>
      )}
      <Button type="submit" disabled={formState.isSubmitting}>
        {submitLabel ?? t('common.continue')}
      </Button>
    </form>
  )
}

function BuildingsStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const buildings = useBuildings()
  const { errors, setErrors } = useServiceErrors()
  const { register, handleSubmit, reset } = useForm({ defaultValues: { name: '' } })
  const onSubmit = handleSubmit(async ({ name }) => {
    const result = await saveBuilding({ name })
    if (!result.ok) return setErrors(result.errors)
    setErrors({})
    reset()
  })
  return (
    <>
      <StepHeading title={t('setup.buildings.title')} body={t('setup.buildings.body')} />
      <AddedList
        items={buildings}
        empty={t('setup.buildings.empty')}
        icon={<Building2 aria-hidden className="size-4" />}
      />
      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 flex items-start gap-2" noValidate>
        <Field label={t('building.name')} error={errors.name} className="flex-1">
          <Input {...register('name')} aria-invalid={!!errors.name} />
        </Field>
        <Button type="submit" variant="outline" className="mt-6">
          {t('common.add')}
        </Button>
      </form>
      <ContinueButton hasItems={(buildings?.length ?? 0) > 0} onClick={onDone} />
    </>
  )
}

function OwnersStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const owners = useOwners()
  const coOwners = owners?.filter((o) => !o.isPrimary)
  return (
    <>
      <StepHeading title={t('setup.owners.title')} body={t('setup.owners.body')} />
      <AddedList
        items={coOwners}
        empty={t('setup.owners.empty')}
        icon={<User aria-hidden className="size-4" />}
      />
      <div className="mt-4">
        <OwnerForm onSaved={() => undefined} submitLabel={t('common.add')} />
      </div>
      <ContinueButton hasItems={(coOwners?.length ?? 0) > 0} onClick={onDone} />
    </>
  )
}

function SharesStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const buildings = useBuildings()
  const owners = useOwners()
  if (!buildings || !owners) return null
  return (
    <>
      <StepHeading title={t('setup.shares.title')} body={t('setup.shares.body')} />
      {buildings.length === 0 && (
        <p className="text-muted-foreground">{t('setup.shares.needOwnersAndBuildings')}</p>
      )}
      <div className="grid gap-4">
        {buildings.map((building) => (
          <BuildingShares key={building.id} building={building} owners={owners} />
        ))}
      </div>
      <ContinueButton hasItems onClick={onDone} />
    </>
  )
}

function BuildingShares({ building, owners }: { building: Building; owners: Owner[] }) {
  const { t } = useTranslation()
  const sets = useLiveQuery(() => listShareSets(building.id), [building.id])
  if (sets === undefined) return null
  const latest = sets[0]
  return (
    <Card className="p-4" aria-label={building.name}>
      <h2 className="mb-3 font-semibold">{building.name}</h2>
      {latest ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check aria-hidden className="size-4 text-primary" />
          {t('shares.summary', { month: formatPeriod(latest.effectiveFrom) })}
        </p>
      ) : (
        <ShareSetForm
          buildingId={building.id}
          owners={owners}
          defaultPeriod={currentPeriod()}
          onSaved={() => undefined}
        />
      )}
    </Card>
  )
}

function DoneStep() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <>
      <StepHeading title={t('setup.done.title')} body={t('setup.done.body')} />
      <Card className="flex gap-3 p-4">
        <Smartphone aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold">{t('setup.done.installTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('setup.done.installBody')}</p>
        </div>
      </Card>
      <Button
        className="mt-6 w-full"
        onClick={() => {
          void completeSetup().then(() => navigate('/', { replace: true }))
        }}
      >
        {t('setup.done.finish')}
      </Button>
    </>
  )
}

function AddedList({
  items,
  empty,
  icon,
}: {
  items: { id: string; name: string }[] | undefined
  empty: string
  icon: ReactNode
}) {
  if (items === undefined) return null
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
          {icon}
          {item.name}
        </li>
      ))}
    </ul>
  )
}

function ContinueButton({ hasItems, onClick }: { hasItems: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button variant={hasItems ? 'default' : 'outline'} className="mt-8 w-full" onClick={onClick}>
      {hasItems ? t('common.continue') : t('common.skipForNow')}
    </Button>
  )
}
