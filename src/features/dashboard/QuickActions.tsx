import { Gauge, Plus, Receipt, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/ui/components/button'

/** The dashboard's floating button with its quick actions (AGENT.md section 9). */
export function QuickActions() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const actions = [
    { to: '/expenses/new', label: t('dashboard.addExpense'), icon: Receipt },
    { to: '/readings', label: t('dashboard.enterReadings'), icon: Gauge },
  ]
  return (
    <>
      {/* Tapping outside the menu closes it. */}
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-background/70"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3">
        {open && (
          <ul id={menuId} className="grid gap-2">
            {actions.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex h-12 items-center gap-3 rounded-full border bg-background px-5 font-medium shadow-md hover:bg-accent"
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          className="size-14 rounded-full shadow-lg [&_svg:not([class*='size-'])]:size-6"
          aria-label={t('dashboard.quickActions')}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden /> : <Plus aria-hidden />}
        </Button>
      </div>
    </>
  )
}
