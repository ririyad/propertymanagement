import type { ComponentProps } from 'react'
import { cn } from '@/ui/cn'

// 16 px text so Chrome on Android does not zoom; 48 px tall for touch (AGENT.md section 9).
export const controlClass =
  'h-12 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(controlClass, className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(controlClass, 'pr-8', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, 'h-auto min-h-24 py-2', className)}
      {...props}
    />
  )
}
