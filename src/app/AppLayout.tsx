import { Outlet } from 'react-router'
import { BottomNav } from '@/ui/BottomNav'
import { UpdatePrompt } from './UpdatePrompt'

export function AppLayout() {
  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)]">
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav />
      <UpdatePrompt />
    </div>
  )
}
