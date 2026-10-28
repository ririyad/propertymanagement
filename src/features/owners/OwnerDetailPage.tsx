import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Phone, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { listBuildings } from '@/data/repositories/buildings'
import { getOwner } from '@/data/repositories/owners'
import { resolveShares } from '@/data/repositories/shares'
import { currentPeriod } from '@/services/clock'
import { deleteOwner, restoreOwner } from '@/services/owners'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { ErrorText } from '@/ui/Field'
import { formatBp, formatPeriod } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/** An owner's details and current share in each building (AGENT.md section 9). */
export function OwnerDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const owner = useLiveQuery(() => getOwner(id), [id])
  const shares = useLiveQuery(async () => {
    const period = currentPeriod()
    const rows = await Promise.all(
      (await listBuildings()).map(async (building) => {
        const resolved = await resolveShares(building.id, period)
        if (!resolved.ok) return null
        const entry = resolved.value.owners.find((o) => o.ownerId === id)
        return entry
          ? { building, bp: entry.bp, from: resolved.value.shareSet.effectiveFrom }
          : null
      }),
    )
    return rows.filter((r) => r !== null)
  }, [id])

  if (!owner) return null

  const onDelete = async () => {
    const result = await deleteOwner(id)
    if (!result.ok) return setErrors(result.errors)
    void navigate('/owners')
    toast({
      message: t('owners.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreOwner(id) },
    })
  }

  return (
    <>
      <PageHeader
        title={owner.name}
        back="/owners"
        actions={
          <Link to={`/owners/${id}/edit`} className={outlineLinkClass}>
            <Pencil aria-hidden />
            {t('common.edit')}
          </Link>
        }
      />
      <div className="grid gap-4">
        {(owner.isPrimary || owner.relation || owner.phone || owner.note) && (
          <Card className="grid gap-2 p-4">
            {owner.isPrimary && <p className="font-medium">{t('owner.primary')}</p>}
            {owner.relation && <p>{owner.relation}</p>}
            {owner.phone && (
              <a href={`tel:${owner.phone}`} className="flex items-center gap-2 text-primary">
                <Phone aria-hidden className="size-4" />
                {owner.phone}
              </a>
            )}
            {owner.note && <p className="text-muted-foreground">{owner.note}</p>}
          </Card>
        )}

        <Card className="p-4">
          <h2 className="mb-2 font-semibold">{t('owners.sharesTitle')}</h2>
          {shares?.length === 0 && <p className="text-muted-foreground">{t('owners.noShares')}</p>}
          <ul className="grid gap-1">
            {shares?.map((s) => (
              <li key={s.building.id} className="flex justify-between gap-4">
                <span>{s.building.name}</span>
                <span className="text-muted-foreground">
                  {t('owners.shareLine', { percent: formatBp(s.bp), month: formatPeriod(s.from) })}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {!owner.isPrimary && (
          <div>
            <Button variant="outline" onClick={() => void onDelete()}>
              <Trash2 aria-hidden />
              {t('common.delete')}
            </Button>
            <ErrorText error={errors.owner} />
          </div>
        )}
      </div>
    </>
  )
}
