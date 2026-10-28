import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

interface PageHeaderProps {
  title: string
  /** Where the back arrow goes; omitted on top-level tabs. */
  back?: string
  actions?: ReactNode
}

export function PageHeader({ title, back, actions }: PageHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="flex items-center gap-2 pt-2 pb-4">
      <title>{t('app.pageTitle', { page: title })}</title>
      {back && (
        <Link
          to={back}
          aria-label={t('common.back')}
          className="-ml-3 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-accent"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </header>
  )
}
