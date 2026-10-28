import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { db } from '@/data/db'
import { isLive } from '@/data/records'
import { getBuilding } from '@/data/repositories/buildings'
import { listShareEntries, listShareSets } from '@/data/repositories/shares'
import { addMonths } from '@/domain/period'
import { useOwners } from '@/features/shared/useLookups'
import { currentPeriod } from '@/services/clock'
import { PageHeader } from '@/ui/PageHeader'
import { ShareSetForm } from './ShareSetForm'

/**
 * Edits a share set, or adds one that starts from the newest set's entries. A new set starts this
 * month, or the month after the newest set if that one starts this month or later.
 */
export function ShareSetEditPage() {
  const { id = '', shareSetId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const owners = useOwners()
  const loaded = useLiveQuery(async () => {
    const building = await getBuilding(id)
    const source = shareSetId ? await db.shareSet.get(shareSetId) : (await listShareSets(id))[0]
    const entries = source ? await listShareEntries(source.id) : []
    return { building, source, entries }
  }, [id, shareSetId])
  if (!loaded?.building || !owners) return null

  const { source, entries } = loaded
  const editing = shareSetId !== undefined
  if (editing && (!source || !isLive(source) || source.buildingId !== id)) {
    return <Navigate to={`/buildings/${id}/shares`} replace />
  }
  const now = currentPeriod()
  const initial = source && {
    id: editing ? source.id : undefined,
    effectiveFrom: editing
      ? source.effectiveFrom
      : source.effectiveFrom >= now
        ? addMonths(source.effectiveFrom, 1)
        : now,
    methodNote: editing ? source.methodNote : null,
    entries: entries.map((e) => ({ ownerId: e.ownerId, bp: e.bp })),
  }

  return (
    <>
      <PageHeader
        title={editing ? t('sharesPage.editTitle') : t('sharesPage.newTitle')}
        back={`/buildings/${id}/shares`}
      />
      <ShareSetForm
        buildingId={id}
        owners={owners}
        initial={initial}
        defaultPeriod={now}
        onSaved={() => void navigate(`/buildings/${id}/shares`, { replace: true })}
      />
    </>
  )
}
