import { beforeEach, describe, expect, it } from 'vitest'
import { listAllocations, listMeterExpenses } from '@/data/repositories/expenses'
import { poisha } from '@/domain/money'
import { isoDate } from '@/domain/period'
import type { MeterPayer, MeterType } from '@/domain/types'
import { ELECTRICITY_CATEGORY_ID } from '@/services/categories'
import { saveExpense } from '@/services/expenses'
import { saveMeterEntry } from '@/services/meterEntries'
import { saveMeter } from '@/services/meters'
import { resetDb, seedBuildingA, seedSystemCategories, unwrap } from '@/test/db'

const today = isoDate('2026-10-15')

beforeEach(async () => {
  await resetDb()
  await seedSystemCategories()
})

async function setup(type: MeterType, payer: MeterPayer = 'OWNERS') {
  const seeded = await seedBuildingA()
  const meter = unwrap(
    await saveMeter({
      buildingId: seeded.building.id,
      label: 'Main',
      type,
      payer,
      categoryId: ELECTRICITY_CATEGORY_ID,
      isActive: true,
    }),
  )
  return { ...seeded, meter }
}

describe('saveMeterEntry (AGENT.md 8.4)', () => {
  it('records a paid postpaid bill as a confirmed expense split by share', async () => {
    const { meter, o1 } = await setup('POSTPAID')
    const bill = unwrap(
      await saveMeterEntry(
        {
          meterId: meter.id,
          period: '2026-09',
          amount: poisha(203070),
          dueDate: '2026-10-20',
          paidDate: '2026-10-18',
          paidByOwnerId: o1.id,
          units: 280,
        },
        today,
      ),
    )
    expect(bill).toMatchObject({
      status: 'CONFIRMED',
      source: 'METER_POSTPAID',
      categoryId: ELECTRICITY_CATEGORY_ID,
      meterId: meter.id,
      period: '2026-09',
      date: '2026-10-18',
      dueDate: '2026-10-20',
      units: 280,
      isPaid: true,
      paidByOwnerId: o1.id,
      splitRule: 'BY_SHARE',
    })
    expect(await listAllocations(bill.id)).toHaveLength(3)
  })

  it('leaves an unpaid bill payable, dated by its due date', async () => {
    const { meter } = await setup('POSTPAID')
    const bill = unwrap(
      await saveMeterEntry(
        { meterId: meter.id, period: '2026-10', amount: poisha(5000), dueDate: '2026-10-25' },
        today,
      ),
    )
    expect(bill).toMatchObject({ isPaid: false, paidByOwnerId: null, date: '2026-10-25' })
  })

  it('records a recharge in the month of its date', async () => {
    const { meter, o2 } = await setup('PREPAID')
    const recharge = unwrap(
      await saveMeterEntry(
        {
          meterId: meter.id,
          amount: poisha(50000),
          paidDate: '2026-09-28',
          paidByOwnerId: o2.id,
          note: 'Token 1234',
        },
        today,
      ),
    )
    expect(recharge).toMatchObject({
      source: 'METER_PREPAID',
      period: '2026-09',
      date: '2026-09-28',
      dueDate: null,
      isPaid: true,
      paidByOwnerId: o2.id,
      note: 'Token 1234',
    })
    expect(
      await saveMeterEntry({ meterId: meter.id, amount: poisha(50000), paidDate: '2026-12-01' }),
    ).toEqual({
      ok: false,
      errors: {
        paidDate: 'errors.period.tooFarAhead',
        paidByOwnerId: 'errors.expense.payerRequired',
      },
    })
    expect(await saveMeterEntry({ meterId: meter.id, amount: poisha(50000) })).toEqual({
      ok: false,
      errors: { paidDate: 'errors.meterEntry.rechargeDateRequired' },
    })
  })

  it('keeps a tenant-paid entry for reference only', async () => {
    const { meter } = await setup('PREPAID', 'TENANT')
    const recharge = unwrap(
      await saveMeterEntry(
        { meterId: meter.id, amount: poisha(50000), paidDate: '2026-10-02' },
        today,
      ),
    )
    expect(recharge).toMatchObject({ splitRule: 'TENANT_PAID', isPaid: false })
    expect(await listAllocations(recharge.id)).toEqual([])
  })

  it('keeps a split changed in the expense editor when the bill is edited', async () => {
    const { meter, o3 } = await setup('POSTPAID')
    const bill = unwrap(
      await saveMeterEntry(
        { meterId: meter.id, period: '2026-10', amount: poisha(5000), dueDate: '2026-10-25' },
        today,
      ),
    )
    unwrap(await saveExpense({ ...bill, splitRule: 'SINGLE_OWNER', singleOwnerId: o3.id }, today))
    unwrap(
      await saveMeterEntry(
        { id: bill.id, meterId: meter.id, period: '2026-10', amount: poisha(6000) },
        today,
      ),
    )
    expect(await listAllocations(bill.id)).toMatchObject([{ ownerId: o3.id, amount: 6000 }])
    expect(await listMeterExpenses(meter.id)).toHaveLength(1)
  })

  it('has no entries for sub meters', async () => {
    const { meter } = await setup('SUB')
    expect(
      await saveMeterEntry({ meterId: meter.id, period: '2026-10', amount: poisha(5000) }, today),
    ).toEqual({ ok: false, errors: { meterId: 'errors.expense.meterInvalid' } })
  })
})
