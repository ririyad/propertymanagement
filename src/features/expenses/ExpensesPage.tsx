import { Plus, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/ui/EmptyState'
import { primaryLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'

export function ExpensesPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        actions={
          <Link to="/expenses/new" className={primaryLinkClass}>
            <Plus aria-hidden />
            {t('expenses.add')}
          </Link>
        }
      />
      <EmptyState
        icon={Receipt}
        title={t('expenses.emptyTitle')}
        description={t('expenses.emptyBody')}
      />
    </>
  )
}
