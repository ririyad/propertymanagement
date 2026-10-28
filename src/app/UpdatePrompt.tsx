import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/ui/components/button'

/** Offers to reload when a new version of the app has been downloaded (AGENT.md 11.1). */
export function UpdatePrompt() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-lg"
    >
      <p className="min-w-40 flex-1 text-sm">{t('update.ready')}</p>
      <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('update.later')}
      </Button>
      <Button onClick={() => void updateServiceWorker(true)}>{t('update.reload')}</Button>
    </div>
  )
}
