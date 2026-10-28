import { Ellipsis, FileChartColumn, KeyRound, LayoutDashboard, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { cn } from '@/ui/cn'

const tabs = [
  { to: '/', label: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/expenses', label: 'nav.expenses', icon: Receipt },
  { to: '/rent', label: 'nav.rent', icon: KeyRound },
  { to: '/reports', label: 'nav.reports', icon: FileChartColumn },
  { to: '/more', label: 'nav.more', icon: Ellipsis },
] as const

export function BottomNav() {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-3xl">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-primary/15 text-primary',
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                  </span>
                  {t(label)}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
