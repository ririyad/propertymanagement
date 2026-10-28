import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '@/ui/PageHeader'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('notFound.title')} />
      <EmptyState
        icon={SearchX}
        title={t('notFound.title')}
        description={t('notFound.body')}
        action={
          <Link
            to="/"
            className="inline-flex h-12 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t('notFound.home')}
          </Link>
        }
      />
    </>
  )
}
