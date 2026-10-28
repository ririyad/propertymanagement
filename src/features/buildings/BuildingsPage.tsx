import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { listBuildingGroups } from '@/data/repositories/buildings'
import { useBuildings } from '@/features/shared/useLookups'
import { EmptyState } from '@/ui/EmptyState'
import { primaryLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'

export function BuildingsPage() {
  const { t } = useTranslation()
  const buildings = useBuildings()
  const groups = useLiveQuery(listBuildingGroups, [])
  const groupName = (id: string | null) => groups?.find((g) => g.id === id)?.name

  return (
    <>
      <PageHeader
        title={t('buildings.title')}
        back="/more"
        actions={
          <Link to="/buildings/new" className={primaryLinkClass}>
            <Plus aria-hidden />
            {t('buildings.add')}
          </Link>
        }
      />
      {buildings?.length === 0 && (
        <EmptyState
          icon={Building2}
          title={t('buildings.empty')}
          description={t('buildings.emptyBody')}
        />
      )}
      {buildings && buildings.length > 0 && (
        <List>
          {buildings.map((b) => (
            <ListRow
              key={b.id}
              to={`/buildings/${b.id}`}
              title={b.name}
              detail={[groupName(b.groupId), b.address].filter(Boolean).join(' · ') || undefined}
            />
          ))}
        </List>
      )}
    </>
  )
}
