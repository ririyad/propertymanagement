import { useLiveQuery } from 'dexie-react-hooks'
import { Gauge, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { getBuilding } from '@/data/repositories/buildings'
import { listMeters } from '@/data/repositories/meters'
import { EmptyState } from '@/ui/EmptyState'
import { primaryLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'
import { meterDetail, underParents } from './meterText'

/** A building's meters with their type, main meter and payer (AGENT.md section 9, P1-T05). */
export function MetersPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const building = useLiveQuery(() => getBuilding(id), [id])
  const meters = useLiveQuery(() => listMeters(id), [id])
  if (!building || !meters) return null

  const addLink = (
    <Link to={`/buildings/${id}/meters/new`} className={primaryLinkClass}>
      <Plus aria-hidden />
      {t('meters.add')}
    </Link>
  )
  return (
    <>
      <PageHeader
        title={t('meters.title', { building: building.name })}
        back={`/buildings/${id}`}
        actions={meters.length > 0 && addLink}
      />
      {meters.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title={t('meters.empty')}
          description={t('meters.emptyBody')}
          action={addLink}
        />
      ) : (
        <List>
          {underParents(meters).map((meter) => (
            <ListRow
              key={meter.id}
              to={`/meters/${meter.id}`}
              title={meter.label}
              detail={meterDetail(t, meter, meters)}
            />
          ))}
        </List>
      )}
    </>
  )
}
