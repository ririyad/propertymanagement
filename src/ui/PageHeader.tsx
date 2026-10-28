import { useTranslation } from 'react-i18next'

export function PageHeader({ title }: { title: string }) {
  const { t } = useTranslation()
  return (
    <header className="pt-2 pb-4">
      <title>{t('app.pageTitle', { page: title })}</title>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    </header>
  )
}
