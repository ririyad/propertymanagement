import { useLiveQuery } from 'dexie-react-hooks'
import { ChartPie, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { getBuilding } from '@/data/repositories/buildings'
import { listShareEntries, listShareSets } from '@/data/repositories/shares'
import { inForce } from '@/domain/period'
import type { ShareSet } from '@/domain/types'
import { useOwners } from '@/features/shared/useLookups'
import { currentPeriod } from '@/services/clock'
import { deleteShareSet, restoreShareSet } from '@/services/shares'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { EmptyState } from '@/ui/EmptyState'
import { formatBp, formatPeriod } from '@/ui/format'
import { outlineLinkClass, primaryLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'

/** Share set history of a building, newest first (AGENT.md section 9, P1-T03). */
export function SharesPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const toast = useToast()
  const owners = useOwners()
  const building = useLiveQuery(() => getBuilding(id), [id])
  const sets = useLiveQuery(async () => {
    const list = await listShareSets(id)
    return Promise.all(list.map(async (set) => ({ set, entries: await listShareEntries(set.id) })))
  }, [id])
  if (!building || !sets) return null

  const now = currentPeriod()
  const current = inForce(
    sets.map((s) => s.set),
    now,
  )
  const status = (set: ShareSet) =>
    set.effectiveFrom > now
      ? t('sharesPage.upcoming')
      : set.id === current?.id
        ? t('sharesPage.current')
        : t('sharesPage.earlier')
  const ownerName = (ownerId: string) => owners?.find((o) => o.id === ownerId)?.name ?? ''
  const onDelete = async (shareSetId: string) => {
    const result = await deleteShareSet(shareSetId)
    if (!result.ok) return
    toast({
      message: t('sharesPage.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreShareSet(result.value) },
    })
  }
  const addLink = (
    <Link to={`/buildings/${id}/shares/new`} className={primaryLinkClass}>
      <Plus aria-hidden />
      {t('sharesPage.add')}
    </Link>
  )

  return (
    <>
      <PageHeader
        title={t('sharesPage.title', { building: building.name })}
        back={`/buildings/${id}`}
        actions={sets.length > 0 && addLink}
      />
      {sets.length === 0 && (
        <EmptyState
          icon={ChartPie}
          title={t('sharesPage.empty')}
          description={t('sharesPage.emptyBody')}
          action={addLink}
        />
      )}
      <div className="grid gap-4">
        {sets.map(({ set, entries }) => {
          const month = formatPeriod(set.effectiveFrom)
          return (
            <Card key={set.id} className="p-4" aria-label={t('sharesPage.from', { month })}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">{t('sharesPage.from', { month })}</h2>
                  <p className="text-sm text-muted-foreground">
                    {status(set)} · {t(`shares.method.${set.method}`)}
                  </p>
                  {set.methodNote && (
                    <p className="text-sm text-muted-foreground">{set.methodNote}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link
                    to={`/buildings/${id}/shares/${set.id}/edit`}
                    className={outlineLinkClass}
                    aria-label={t('sharesPage.edit', { month })}
                  >
                    <Pencil aria-hidden />
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('sharesPage.delete', { month })}
                    onClick={() => void onDelete(set.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
              <ul className="mt-3 grid gap-1">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex justify-between gap-4">
                    <span>{ownerName(entry.ownerId)}</span>
                    <span className="tabular-nums">{formatBp(entry.bp)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </>
  )
}
