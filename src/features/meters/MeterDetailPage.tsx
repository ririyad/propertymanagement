import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getCategory } from '@/data/repositories/categories'
import { getMeter, listTariffs } from '@/data/repositories/meters'
import type { Meter, Tariff } from '@/domain/types'
import { deleteMeter, restoreMeter } from '@/services/meters'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { ErrorText } from '@/ui/Field'
import { formatPeriod } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'
import { tariffSummary } from './meterText'

/** A meter's details and, for a sub meter, its tariffs (AGENT.md section 9, P1-T05). */
export function MeterDetailPage() {
  const { meterId = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const loaded = useLiveQuery(async () => {
    const meter = await getMeter(meterId)
    if (!meter || !isLive(meter)) return undefined
    const [parent, category, tariffs] = await Promise.all([
      meter.parentMeterId ? getMeter(meter.parentMeterId) : undefined,
      getCategory(meter.categoryId),
      listTariffs(meter.id),
    ])
    return { meter, parent, category, tariffs }
  }, [meterId])
  if (!loaded) return null
  const { meter, parent, category, tariffs } = loaded

  const onDelete = async () => {
    const result = await deleteMeter(meter.id)
    if (!result.ok) return setErrors(result.errors)
    void navigate(`/buildings/${meter.buildingId}/meters`, { replace: true })
    toast({
      message: t('meters.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreMeter(meter.id) },
    })
  }

  return (
    <>
      <PageHeader
        title={meter.label}
        back={`/buildings/${meter.buildingId}/meters`}
        actions={
          <Link to={`/meters/${meter.id}/edit`} className={outlineLinkClass}>
            <Pencil aria-hidden />
            {t('common.edit')}
          </Link>
        }
      />
      <div className="grid gap-6">
        <Card className="p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <Row label={t('meter.type')}>{t(`meter.types.${meter.type}`)}</Row>
            {meter.meterNo && <Row label={t('meter.meterNo')}>{meter.meterNo}</Row>}
            <Row label={t('meter.payer')}>{t(`meter.payers.${meter.payer}`)}</Row>
            {meter.type === 'SUB' && (
              <Row label={t('meter.parent')}>{parent?.label ?? t('meter.noParent')}</Row>
            )}
            <Row label={t('meter.category')}>{category?.name}</Row>
            <Row label={t('meter.isActive')}>
              {meter.isActive ? t('meter.isActive') : t('meter.inactive')}
            </Row>
          </dl>
        </Card>
        {meter.type === 'SUB' && <Tariffs meter={meter} tariffs={tariffs} />}
        <div>
          <Button variant="outline" onClick={() => void onDelete()}>
            <Trash2 aria-hidden />
            {t('common.delete')}
          </Button>
          <ErrorText error={errors.meter} />
        </div>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function Tariffs({ meter, tariffs }: { meter: Meter; tariffs: Tariff[] }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="tariffs-title" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="tariffs-title" className="text-lg font-semibold">
          {t('meters.tariffs')}
        </h2>
        <Link to={`/meters/${meter.id}/tariffs/new`} className={outlineLinkClass}>
          <Plus aria-hidden />
          {t('meters.addTariff')}
        </Link>
      </div>
      {tariffs.length === 0 ? (
        <p className="text-muted-foreground">{t('meters.noTariffs')}</p>
      ) : (
        <List>
          {tariffs.map((tariff) => (
            <ListRow
              key={tariff.id}
              to={`/meters/${meter.id}/tariffs/${tariff.id}/edit`}
              title={t('tariff.from', { month: formatPeriod(tariff.effectiveFrom) })}
              detail={tariffSummary(t, tariff)}
            />
          ))}
        </List>
      )}
    </section>
  )
}
