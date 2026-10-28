import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutDashboard } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import {
  listAllocationsOf,
  listMonthExpenses,
  listUnpaidExpenses,
} from '@/data/repositories/expenses'
import { listDrafts } from '@/data/repositories/recurring'
import type { Poisha } from '@/domain/money'
import { isPeriod } from '@/domain/period'
import { expenseTotals } from '@/domain/totals'
import { useBuildings, useCategories, useOwners } from '@/features/shared/useLookups'
import { currentPeriod } from '@/services/clock'
import { Card } from '@/ui/components/card'
import { Input, Select } from '@/ui/components/input'
import { EmptyState } from '@/ui/EmptyState'
import { Field } from '@/ui/Field'
import { formatDate, formatPeriod, formatTaka } from '@/ui/format'
import { outlineLinkClass } from '@/ui/linkStyles'
import { List, ListRow } from '@/ui/ListRow'
import { PageHeader } from '@/ui/PageHeader'
import { QuickActions } from './QuickActions'

/** Bills to pay shown on the dashboard before "see all". */
const BILLS_SHOWN = 5

/**
 * The interim monthly summary (AGENT.md section 9, P1-T12): the month's expenses by category and
 * by owner, drafts to confirm and bills to pay. The Phase 3 dashboard replaces it.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const monthParam = params.get('month') ?? ''
  const month = isPeriod(monthParam) ? monthParam : currentPeriod()
  const buildingId = params.get('building') ?? ''
  const owners = useOwners()
  const buildings = useBuildings()
  const categories = useCategories()
  const drafts = useLiveQuery(listDrafts, [])
  const data = useLiveQuery(async () => {
    const [expenses, unpaid] = await Promise.all([
      listMonthExpenses(month, buildingId || undefined),
      listUnpaidExpenses(buildingId || undefined),
    ])
    return { expenses, unpaid, allocations: await listAllocationsOf(expenses.map((e) => e.id)) }
  }, [month, buildingId])
  if (!data || !owners || !buildings || !categories || !drafts) return null

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const totals = expenseTotals(data.expenses, data.allocations)
  const listLink = (filter: Record<string, string>) =>
    `/expenses?${new URLSearchParams({ month, ...(buildingId && { building: buildingId }), ...filter }).toString()}`
  const byCategory = [...totals.byCategory].sort((a, b) => b[1] - a[1])
  const shownDrafts = drafts.filter((d) => !buildingId || d.buildingId === buildingId)
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? ''

  return (
    <>
      <PageHeader title={t('dashboard.title')} />
      <div className="grid gap-6 pb-20">
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label={t('dashboard.month')}>
            <Input
              type="month"
              value={month}
              onChange={(e) => isPeriod(e.target.value) && setFilter('month', e.target.value)}
            />
          </Field>
          {buildings.length > 1 && (
            <Field label={t('dashboard.building')}>
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
        </div>

        {shownDrafts[0] && (
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3">
            <span className="font-medium">
              {t('confirm.banner', { count: shownDrafts.length })}
            </span>
            <Link to={`/confirm?month=${shownDrafts[0].period}`} className={outlineLinkClass}>
              {t('confirm.bannerAction')}
            </Link>
          </p>
        )}

        {totals.byCategory.size === 0 ? (
          <EmptyState
            icon={LayoutDashboard}
            title={t('dashboard.noExpenses', { month: formatPeriod(month) })}
            description={t('dashboard.noExpensesBody')}
          />
        ) : (
          <>
            <Card className="grid gap-1 p-4">
              <h2 className="text-muted-foreground">
                {t('dashboard.expensesIn', { month: formatPeriod(month) })}
              </h2>
              <p className="text-3xl font-semibold tabular-nums">{formatTaka(totals.total)}</p>
            </Card>
            <Section title={t('dashboard.byCategory')}>
              <List>
                {byCategory.map(([id, amount]) => (
                  <ListRow
                    key={id}
                    to={listLink({ category: id })}
                    title={categoryName(id)}
                    trailing={<Amount value={amount} />}
                  />
                ))}
              </List>
            </Section>
            <Section title={t('dashboard.byOwner')}>
              <List>
                {owners
                  .filter((o) => totals.byOwner.has(o.id))
                  .map((owner) => (
                    <ListRow
                      key={owner.id}
                      to={listLink({ owner: owner.id })}
                      title={owner.name}
                      trailing={<Amount value={totals.byOwner.get(owner.id)} />}
                    />
                  ))}
              </List>
            </Section>
          </>
        )}

        {data.unpaid.length > 0 && (
          <Section title={t('dashboard.billsToPay')}>
            <List>
              {data.unpaid.slice(0, BILLS_SHOWN).map((bill) => (
                <ListRow
                  key={bill.id}
                  to={`/expenses/${bill.id}`}
                  title={categoryName(bill.categoryId)}
                  detail={
                    bill.dueDate
                      ? t('dashboard.dueOn', { date: formatDate(bill.dueDate) })
                      : formatPeriod(bill.period)
                  }
                  trailing={<Amount value={bill.amount} />}
                />
              ))}
            </List>
            {data.unpaid.length > BILLS_SHOWN && (
              <p className="text-sm text-muted-foreground">
                {t('dashboard.moreBills', { count: data.unpaid.length - BILLS_SHOWN })}
              </p>
            )}
          </Section>
        )}
      </div>
      <QuickActions />
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Amount({ value }: { value: Poisha | undefined }) {
  return value === undefined ? null : (
    <span className="font-medium tabular-nums">{formatTaka(value)}</span>
  )
}
