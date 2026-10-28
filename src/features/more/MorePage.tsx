import { Building2, Users, Wand2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { listShareSets } from '@/data/repositories/shares'
import { useBuildings, useOwners } from '@/features/shared/useLookups'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'

/** The More tab: everything that is not a daily task (AGENT.md section 9). */
export function MorePage() {
  const { t } = useTranslation()
  const owners = useOwners()
  const buildings = useBuildings()
  const missingShares = useLiveQuery(async () => {
    const all = await Promise.all((buildings ?? []).map((b) => listShareSets(b.id)))
    return all.some((sets) => sets.length === 0)
  }, [buildings])
  const setupUnfinished = buildings?.length === 0 || owners?.length === 1 || missingShares === true

  return (
    <>
      <PageHeader title={t('more.title')} />
      <List>
        {setupUnfinished && (
          <ListRow
            to="/setup?step=buildings"
            title={<Icon icon={Wand2}>{t('more.setup')}</Icon>}
            detail={t('more.setupDetail')}
          />
        )}
        <ListRow to="/owners" title={<Icon icon={Users}>{t('owners.title')}</Icon>} />
        <ListRow to="/buildings" title={<Icon icon={Building2}>{t('buildings.title')}</Icon>} />
      </List>
    </>
  )
}

function Icon({ icon: IconComponent, children }: { icon: typeof Users; children: string }) {
  return (
    <span className="flex items-center gap-3">
      <IconComponent aria-hidden className="size-5 text-muted-foreground" />
      {children}
    </span>
  )
}
