import { KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '@/ui/PageHeader'

export function RentPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('rent.title')} />
      <EmptyState icon={KeyRound} title={t('rent.emptyTitle')} description={t('rent.emptyBody')} />
    </>
  )
}
