import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  /** The one clear call to action (AGENT.md section 9). */
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">
        <Icon aria-hidden className="size-8" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-muted-foreground">{description}</p>
      {action}
    </section>
  )
}
