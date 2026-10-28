import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { isLive } from '@/data/records'
import { getBuilding } from '@/data/repositories/buildings'
import { getCategory } from '@/data/repositories/categories'
import { getExpense, listAllocations } from '@/data/repositories/expenses'
import { getMeter } from '@/data/repositories/meters'
import type { Expense, ExpenseAllocation, Owner } from '@/domain/types'
import { loadPhotoItems } from '@/features/shared/photoItems'
import { useOwners } from '@/features/shared/useLookups'
import { deleteExpense, restoreExpense } from '@/services/expenses'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { ErrorText } from '@/ui/Field'
import { formatDate, formatPeriod, formatTaka, formatUnits } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { PageHeader } from '@/ui/PageHeader'
import { PhotoGallery } from '@/ui/PhotoSlots'
import { useToast } from '@/ui/toastContext'
import { useServiceErrors } from '@/ui/useServiceErrors'

/** Where an expense is edited: meter bills and recharges have their own editor. */
function editLink(expense: Expense): string {
  const fromMeterEntry = expense.source === 'METER_POSTPAID' || expense.source === 'METER_PREPAID'
  return fromMeterEntry && expense.meterId
    ? `/meters/${expense.meterId}/entry/${expense.id}`
    : `/expenses/${expense.id}/edit`
}

/** One expense with each owner's share (`/expenses/:id`), AGENT.md section 9, P1-T11. */
export function ExpenseDetailPage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const { errors, setErrors } = useServiceErrors()
  const owners = useOwners()
  const loaded = useLiveQuery(async () => {
    const expense = await getExpense(id)
    if (!expense || !isLive(expense)) return null
    const [allocations, photos, building, category, meter] = await Promise.all([
      listAllocations(expense.id),
      loadPhotoItems('EXPENSE', expense.id),
      getBuilding(expense.buildingId),
      getCategory(expense.categoryId),
      expense.meterId ? getMeter(expense.meterId) : undefined,
    ])
    return { expense, allocations, photos, building, category, meter }
  }, [id])
  if (!loaded || !owners) return null
  const { expense, allocations, photos, building, category, meter } = loaded
  const fromReading = expense.source === 'METER_SUB'
  const listLink = `/expenses?month=${expense.period}`
  const ownerName = (ownerId: string | null) => owners.find((o) => o.id === ownerId)?.name

  const onDelete = async () => {
    const result = await deleteExpense(expense.id)
    if (!result.ok) return setErrors(result.errors)
    void navigate(listLink, { replace: true })
    toast({
      message: t('expenseDetail.deleted'),
      action: { label: t('common.undo'), onClick: () => void restoreExpense(result.value) },
    })
  }

  const payment =
    expense.splitRule === 'TENANT_PAID'
      ? t('expenses.tenantPaid')
      : expense.isPaid
        ? t('expenses.paidBy', { name: ownerName(expense.paidByOwnerId) })
        : t('expenses.unpaid')
  return (
    <>
      <PageHeader
        title={category?.name ?? ''}
        back={listLink}
        actions={
          expense.status !== 'DRAFT' && (
            <Link to={editLink(expense)} className={outlineLinkClass}>
              <Pencil aria-hidden />
              {t('common.edit')}
            </Link>
          )
        }
      />
      <div className="grid gap-6">
        <Card className="grid gap-3 p-4">
          <p className="text-3xl font-semibold tabular-nums">{formatTaka(expense.amount)}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <Row label={t('expenseDetail.building')}>{building?.name}</Row>
            {meter && <Row label={t('expenseDetail.meter')}>{meter.label}</Row>}
            <Row label={t('expenseDetail.month')}>{formatPeriod(expense.period)}</Row>
            <Row label={t('expenseDetail.date')}>{formatDate(expense.date)}</Row>
            {expense.dueDate && (
              <Row label={t('expenseDetail.dueDate')}>{formatDate(expense.dueDate)}</Row>
            )}
            {expense.units !== null && (
              <Row label={t('expenseDetail.units')}>{formatUnits(expense.units)}</Row>
            )}
            <Row label={t('expenseDetail.payment')}>{payment}</Row>
            <Row label={t('expenseDetail.split')}>{t(`splitRule.${expense.splitRule}`)}</Row>
            {expense.note && <Row label={t('expenseDetail.note')}>{expense.note}</Row>}
          </dl>
        </Card>
        <Shares expense={expense} allocations={allocations} owners={owners} />
        <PhotoGallery photos={photos} />
        {fromReading ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground">
            {t('expenseDetail.fromReading', { month: formatPeriod(expense.period) })}
            <Link
              to={`/readings?building=${expense.buildingId}&month=${expense.period}`}
              className={outlineLinkClass}
            >
              {t('expenseDetail.toReadings')}
            </Link>
          </p>
        ) : (
          <div>
            <Button variant="outline" onClick={() => void onDelete()}>
              <Trash2 aria-hidden />
              {t('common.delete')}
            </Button>
            <ErrorText error={errors.expense} />
          </div>
        )}
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

/** The stored allocation of each owner (AGENT.md 7.4). */
function Shares({
  expense,
  allocations,
  owners,
}: {
  expense: Expense
  allocations: ExpenseAllocation[]
  owners: Owner[]
}) {
  const { t } = useTranslation()
  const body = () => {
    if (expense.status === 'DRAFT')
      return (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground">
          {t('expenseDetail.sharesDraft')}
          <Link to={`/confirm?month=${expense.period}`} className={outlineLinkClass}>
            {t('expenseDetail.toConfirm')}
          </Link>
        </p>
      )
    if (expense.splitRule === 'TENANT_PAID')
      return <p className="text-muted-foreground">{t('expenseDetail.sharesTenant')}</p>
    return (
      <table className="w-full">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t('expenseDetail.owner')}</th>
            <th scope="col">{t('expenseDetail.share')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {owners.map((owner) => {
            const allocation = allocations.find((a) => a.ownerId === owner.id)
            return (
              allocation && (
                <tr key={owner.id}>
                  <th scope="row" className="py-2 text-left font-normal">
                    {owner.name}
                  </th>
                  <td className="py-2 text-right tabular-nums">{formatTaka(allocation.amount)}</td>
                </tr>
              )
            )
          })}
        </tbody>
      </table>
    )
  }
  return (
    <section aria-labelledby="shares-title" className="grid gap-2">
      <h2 id="shares-title" className="text-lg font-semibold">
        {t('expenseDetail.shares')}
      </h2>
      <Card className="px-4 py-2">{body()}</Card>
    </section>
  )
}
