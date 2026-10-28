import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChartPie,
  Equal,
  House,
  Percent,
  Plus,
  Receipt,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { listAllocationsOf, listMonthExpenses } from '@/data/repositories/expenses'
import { listDrafts } from '@/data/repositories/recurring'
import { poisha } from '@/domain/money'
import { isPeriod } from '@/domain/period'
import { expenseTotals } from '@/domain/totals'
import type { Expense, SplitRule } from '@/domain/types'
import { useBuildings, useCategories, useOwners } from '@/features/shared/useLookups'
import { currentPeriod } from '@/services/clock'
import { Card } from '@/ui/components/card'
import { Input, Select } from '@/ui/components/input'
import { EmptyState } from '@/ui/EmptyState'
import { Field } from '@/ui/Field'
import { formatDate, formatPeriod, formatTaka } from '@/ui/format'
import { outlineLinkClass, primaryLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'

const SPLIT_ICONS: Record<SplitRule, LucideIcon> = {
  BY_SHARE: ChartPie,
  EQUAL: Equal,
  SINGLE_OWNER: User,
  CUSTOM_PERCENT: Percent,
  CUSTOM_AMOUNT: SlidersHorizontal,
  TENANT_PAID: House,
}

/**
 * A month's expenses with building, category and owner filters, and the month's total with each
 * owner's share (`/expenses?month=&building=&category=&owner=`), AGENT.md section 9, P1-T11.
 */
export function ExpensesPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const monthParam = params.get('month') ?? ''
  const month = isPeriod(monthParam) ? monthParam : currentPeriod()
  const buildingId = params.get('building') ?? ''
  const categoryId = params.get('category') ?? ''
  const ownerId = params.get('owner') ?? ''
  const owners = useOwners()
  const buildings = useBuildings()
  const categories = useCategories()
  const drafts = useLiveQuery(listDrafts, [])
  const data = useLiveQuery(async () => {
    const expenses = await listMonthExpenses(month, buildingId || undefined)
    return { expenses, allocations: await listAllocationsOf(expenses.map((e) => e.id)) }
  }, [month, buildingId])
  if (!data || !owners || !buildings || !categories) return null

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const shareOf = (expense: Expense) =>
    data.allocations.find((a) => a.expenseId === expense.id && a.ownerId === ownerId)?.amount
  const shown = data.expenses.filter(
    (e) => (!categoryId || e.categoryId === categoryId) && (!ownerId || shareOf(e) !== undefined),
  )
  const totals = expenseTotals(shown, data.allocations)
  const ownerName = (id: string | null) => owners.find((o) => o.id === id)?.name ?? ''
  const showBuilding = buildings.length > 1 && !buildingId
  const filtered = !!(buildingId || categoryId || ownerId)

  const detail = (expense: Expense) => {
    const share = ownerId ? shareOf(expense) : undefined
    return [
      showBuilding ? buildings.find((b) => b.id === expense.buildingId)?.name : undefined,
      formatDate(expense.date),
      expense.splitRule === 'TENANT_PAID'
        ? t('expenses.tenantPaid')
        : expense.isPaid
          ? t('expenses.paidBy', { name: ownerName(expense.paidByOwnerId) })
          : t('expenses.unpaid'),
      share === undefined
        ? undefined
        : t('expenses.shareOf', { name: ownerName(ownerId), amount: formatTaka(share) }),
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const addParams = new URLSearchParams({ month, ...(buildingId && { building: buildingId }) })

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        actions={
          <Link to={`/expenses/new?${addParams.toString()}`} className={primaryLinkClass}>
            <Plus aria-hidden />
            {t('expenses.add')}
          </Link>
        }
      />
      <div className="grid gap-4">
        {drafts?.[0] && (
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3">
            <span className="font-medium">{t('confirm.banner', { count: drafts.length })}</span>
            <Link to={`/confirm?month=${drafts[0].period}`} className={outlineLinkClass}>
              {t('confirm.bannerAction')}
            </Link>
          </p>
        )}
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label={t('expenses.month')}>
            <Input
              type="month"
              value={month}
              onChange={(e) => isPeriod(e.target.value) && setFilter('month', e.target.value)}
            />
          </Field>
          {buildings.length > 1 && (
            <Field label={t('expenses.building')}>
              <Select value={buildingId} onChange={(e) => setFilter('building', e.target.value)}>
                <option value="">{t('common.allBuildings')}</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('expenses.category')}>
            <Select value={categoryId} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">{t('expenses.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {owners.length > 1 && (
            <Field label={t('expenses.owner')}>
              <Select value={ownerId} onChange={(e) => setFilter('owner', e.target.value)}>
                <option value="">{t('expenses.allOwners')}</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={t('expenses.emptyMonth', { month: formatPeriod(month) })}
            description={filtered ? t('expenses.emptyFiltered') : t('expenses.emptyBody')}
          />
        ) : (
          <>
            <List>
              {shown.map((expense) => {
                const Icon = SPLIT_ICONS[expense.splitRule]
                const counted = expense.splitRule !== 'TENANT_PAID'
                return (
                  <ListRow
                    key={expense.id}
                    to={`/expenses/${expense.id}`}
                    title={categories.find((c) => c.id === expense.categoryId)?.name}
                    detail={detail(expense)}
                    trailing={
                      <span className="flex shrink-0 items-center gap-2">
                        <span role="img" aria-label={t(`splitRule.${expense.splitRule}`)}>
                          <Icon aria-hidden className="size-4 text-muted-foreground" />
                        </span>
                        <span
                          className={
                            counted
                              ? 'font-medium tabular-nums'
                              : 'text-muted-foreground tabular-nums line-through'
                          }
                        >
                          {formatTaka(expense.amount)}
                        </span>
                      </span>
                    }
                  />
                )
              })}
            </List>
            <Card className="p-4">
              <section aria-labelledby="expense-totals" className="grid gap-2">
                <h2 id="expense-totals" className="font-semibold">
                  {t('expenses.totalFor', { month: formatPeriod(month) })}
                </h2>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <dt className="font-medium">{t('expenses.total')}</dt>
                  <dd className="text-right font-medium tabular-nums">
                    {formatTaka(totals.total)}
                  </dd>
                  {owners
                    .filter((o) => !ownerId || o.id === ownerId)
                    .map((o) => (
                      <div key={o.id} className="contents">
                        <dt>{o.name}</dt>
                        <dd className="text-right tabular-nums">
                          {formatTaka(totals.byOwner.get(o.id) ?? poisha(0))}
                        </dd>
                      </div>
                    ))}
                </dl>
                {shown.some((e) => e.splitRule === 'TENANT_PAID') && (
                  <p className="text-sm text-muted-foreground">{t('expenses.tenantNotCounted')}</p>
                )}
              </section>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
