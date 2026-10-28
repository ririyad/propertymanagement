import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/ui/components/button'
import { ToastContext, type ToastOptions } from '@/ui/toastContext'

/** Shows one toast at a time above the bottom navigation. */
export function Toaster({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { key: number }) | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback((options: ToastOptions) => {
    clearTimeout(timer.current)
    setToast({ ...options, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), options.duration ?? 5000)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md"
      >
        {toast && (
          <div
            key={toast.key}
            className="pointer-events-auto flex items-center gap-2 rounded-lg bg-foreground p-2 pl-4 text-background shadow-lg"
          >
            <p className="flex-1 text-sm">{toast.message}</p>
            {toast.action && (
              <Button
                variant="ghost"
                className="text-background hover:bg-background/10 hover:text-background"
                onClick={() => {
                  toast.action?.onClick()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext>
  )
}
