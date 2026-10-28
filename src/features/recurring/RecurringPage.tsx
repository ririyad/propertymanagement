import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Repeat } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { getBuilding } from '@/data/repositories/buildings'
import { listTemplates } from '@/data/repositories/recurring'
import type { RecurringTemplate } from '@/domain/types'
import { useCategories } from '@/features/shared/useLookups'
import { EmptyState } from '@/ui/EmptyState'
import { formatPeriod, formatTaka } from '@/ui/format'
import { primaryLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'

/** A building's recurring costs (`/buildings/:id/templates`), AGENT.md 8.6, P1-T10. */
export function RecurringPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const building = useLiveQuery(() => getBuilding(id), [id])
  const templates = useLiveQuery(() => listTemplates(id), [id])
  const categories = useCategories()
  if (!building || !templates || !categories) return null

  const detail = (template: RecurringTemplate) =>
    [
      formatTaka(template.amount),
      t(`recurring.frequencies.${template.frequency}`),
      template.endPeriod
        ? t('recurring.fromUntil', {
            from: formatPeriod(template.startPeriod),
            until: formatPeriod(template.endPeriod),
          })
        : t('recurring.from', { month: formatPeriod(template.startPeriod) }),
      ...(template.isActive ? [] : [t('recurring.inactive')]),
    ].join(' · ')
  const addLink = (
    <Link to={`/buildings/${id}/templates/new`} className={primaryLinkClass}>
      <Plus aria-hidden />
      {t('recurring.add')}
    </Link>
  )
  return (
    <>
      <PageHeader
        title={t('recurring.title', { building: building.name })}
        back={`/buildings/${id}`}
        actions={templates.length > 0 && addLink}
      />
      {templates.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={t('recurring.empty')}
          description={t('recurring.emptyBody')}
          action={addLink}
        />
      ) : (
        <List>
          {templates.map((template) => (
            <ListRow
              key={template.id}
              to={`/templates/${template.id}/edit`}
              title={categories.find((c) => c.id === template.categoryId)?.name}
              detail={detail(template)}
            />
          ))}
        </List>
      )}
    </>
  )
}
