import type { ComponentProps, ReactNode } from 'react'
import { useTranslateKey } from '@/i18n/useTranslateKey'
import { cn } from '@/ui/cn'

interface FieldProps {
  label: ReactNode
  /** An i18n error key from a service or parser. */
  error?: string | undefined
  errorParams?: Record<string, unknown>
  hint?: ReactNode
  className?: string
  children: ReactNode
}

/** A labelled form control with its inline error (AGENT.md section 6: forms show errors inline). */
export function Field({ label, error, errorParams, hint, className, children }: FieldProps) {
  return (
    <label className={cn('grid gap-1.5 text-sm font-medium', className)}>
      <span>{label}</span>
      {children}
      {hint && !error && <span className="text-sm font-normal text-muted-foreground">{hint}</span>}
      <ErrorText error={error} params={errorParams} />
    </label>
  )
}

export function ErrorText({
  error,
  params,
}: {
  error?: string | undefined
  params?: Record<string, unknown> | undefined
}) {
  const translate = useTranslateKey()
  if (!error) return null
  return <span className="text-sm font-normal text-destructive">{translate(error, params)}</span>
}

export function CheckboxField({
  label,
  className,
  ...props
}: { label: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className={cn('flex min-h-12 items-center gap-3 text-base', className)}>
      <input type="checkbox" className="size-5 accent-primary" {...props} />
      <span>{label}</span>
    </label>
  )
}
