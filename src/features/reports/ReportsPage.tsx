import { FileChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '@/ui/PageHeader'

export function ReportsPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('reports.title')} />
      <EmptyState
        icon={FileChartColumn}
        title={t('reports.emptyTitle')}
        description={t('reports.emptyBody')}
      />
    </>
  )
}
