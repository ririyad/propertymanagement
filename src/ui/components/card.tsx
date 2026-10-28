import type { ComponentProps } from 'react'
import { cn } from '@/ui/cn'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn('rounded-lg border bg-card text-card-foreground', className)}
      {...props}
    />
  )
}
