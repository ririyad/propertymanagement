import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { listDrafts } from '@/data/repositories/recurring'
import { EmptyState } from '@/ui/EmptyState'
import { outlineLinkClass, primaryLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'

export function ExpensesPage() {
  const { t } = useTranslation()
  const drafts = useLiveQuery(listDrafts, [])
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
      {drafts?.[0] && (
        <p className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3">
          <span className="font-medium">{t('confirm.banner', { count: drafts.length })}</span>
          <Link to={`/confirm?month=${drafts[0].period}`} className={outlineLinkClass}>
            {t('confirm.bannerAction')}
          </Link>
        </p>
      )}
      <EmptyState
        icon={Receipt}
        title={t('expenses.emptyTitle')}
        description={t('expenses.emptyBody')}
      />
    </>
  )
}
