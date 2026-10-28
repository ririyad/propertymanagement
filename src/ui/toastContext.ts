import { createContext, useContext } from 'react'

export interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
  /** Milliseconds; undo toasts stay 5 seconds (AGENT.md 8.3). */
  duration?: number
}

export const ToastContext = createContext<(toast: ToastOptions) => void>(() => undefined)

export function useToast(): (toast: ToastOptions) => void {
  return useContext(ToastContext)
}
