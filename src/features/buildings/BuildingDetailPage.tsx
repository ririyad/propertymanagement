import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { db } from '@/data/db'
import { getBuilding } from '@/data/repositories/buildings'
import { listMeters } from '@/data/repositories/meters'
import { listTemplates } from '@/data/repositories/recurring'
import { listShareSets } from '@/data/repositories/shares'
import { inForce } from '@/domain/period'
import { deleteBuilding, restoreBuilding } from '@/services/buildings'
import { currentPeriod } from '@/services/clock'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { ErrorText } from '@/ui/Field'
import { formatPeriod } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/** A building's details and links to what belongs to it (AGENT.md section 9). */
export function BuildingDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const building = useLiveQuery(() => getBuilding(id), [id])
  const group = useLiveQuery(
    async () => (building?.groupId ? db.buildingGroup.get(building.groupId) : undefined),
    [building?.groupId],
  )
  const shareSets = useLiveQuery(() => listShareSets(id), [id])
  const meters = useLiveQuery(() => listMeters(id), [id])
  const meterCount = meters?.length
  const templateCount = useLiveQuery(async () => (await listTemplates(id)).length, [id])
  if (!building) return null

  const shownShareSet = shareSets && (inForce(shareSets, currentPeriod()) ?? shareSets[0])

  const onDelete = async () => {
    const result = await deleteBuilding(id)
    if (!result.ok) return setErrors(result.errors)
    void navigate('/buildings')
    toast({
      message: t('buildings.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreBuilding(id) },
    })
  }

  return (
    <>
      <PageHeader
        title={building.name}
        back="/buildings"
        actions={
          <Link to={`/buildings/${id}/edit`} className={outlineLinkClass}>
            <Pencil aria-hidden />
            {t('common.edit')}
          </Link>
        }
      />
      <div className="grid gap-4">
        {(group || building.address || building.note) && (
          <Card className="grid gap-1 p-4">
            {group && <p className="font-medium">{group.name}</p>}
            {building.address && <p>{building.address}</p>}
            {building.note && <p className="text-muted-foreground">{building.note}</p>}
          </Card>
        )}
        <List>
          <ListRow
            to={`/buildings/${id}/shares`}
            title={t('buildings.sharesLink')}
            detail={
              shownShareSet
                ? t('buildings.sharesCurrent', { month: formatPeriod(shownShareSet.effectiveFrom) })
                : t('buildings.sharesNone')
            }
          />
          <ListRow
            to={`/buildings/${id}/meters`}
            title={t('buildings.metersLink')}
            detail={
              meterCount
                ? t('buildings.metersCount', { count: meterCount })
                : t('buildings.metersNone')
            }
          />
          <ListRow
            to={`/buildings/${id}/templates`}
            title={t('buildings.templatesLink')}
            detail={
              templateCount
                ? t('buildings.templatesCount', { count: templateCount })
                : t('buildings.templatesNone')
            }
          />
          {meters?.some((m) => m.type === 'SUB' && m.isActive) && (
            <ListRow
              to={`/readings?building=${id}&month=${currentPeriod()}`}
              title={t('buildings.readingsLink')}
              detail={t('buildings.readingsHint')}
            />
          )}
        </List>
        <div>
          <Button variant="outline" onClick={() => void onDelete()}>
            <Trash2 aria-hidden />
            {t('common.delete')}
          </Button>
          <ErrorText error={errors.building} />
        </div>
      </div>
    </>
  )
}
