import { LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '@/ui/PageHeader'

export function DashboardPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      <EmptyState
        icon={LayoutDashboard}
        title={t('dashboard.emptyTitle')}
        description={t('dashboard.emptyBody')}
      />
    </>
  )
}
