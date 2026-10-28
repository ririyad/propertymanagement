import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '@/ui/PageHeader'

export function MorePage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('more.title')} />
      <EmptyState icon={Settings} title={t('more.emptyTitle')} description={t('more.emptyBody')} />
    </>
  )
}
