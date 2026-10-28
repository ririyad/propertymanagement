import { Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '@/ui/PageHeader'

export function ExpensesPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('expenses.title')} />
      <EmptyState
        icon={Receipt}
        title={t('expenses.emptyTitle')}
        description={t('expenses.emptyBody')}
      />
    </>
  )
}
