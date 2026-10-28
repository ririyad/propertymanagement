import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useOwners } from '@/features/shared/useLookups'
import { primaryLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'

export function OwnersPage() {
  const { t } = useTranslation()
  const owners = useOwners()
  return (
    <>
      <PageHeader
        title={t('owners.title')}
        back="/more"
        actions={
          <Link to="/owners/new" className={primaryLinkClass}>
            <Plus aria-hidden />
            {t('owners.add')}
          </Link>
        }
      />
      {owners && (
        <List>
          {owners.map((owner) => (
            <ListRow
              key={owner.id}
              to={`/owners/${owner.id}`}
              title={owner.name}
              detail={owner.isPrimary ? t('owner.primary') : (owner.relation ?? undefined)}
            />
          ))}
        </List>
      )}
    </>
  )
}
