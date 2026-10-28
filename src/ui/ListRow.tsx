import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

interface ListRowProps {
  to: string
  title: ReactNode
  detail?: ReactNode
  trailing?: ReactNode
}

/** A tappable row in a list, at least 56 px tall. */
export function ListRow({ to, title, detail, trailing }: ListRowProps) {
  return (
    <li>
      <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          {detail && <span className="line-clamp-2 text-sm text-muted-foreground">{detail}</span>}
        </span>
        {trailing}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y overflow-hidden rounded-lg border bg-card">{children}</ul>
}
