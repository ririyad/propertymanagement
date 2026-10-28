import { describe, expect, it } from 'vitest'
import { allocateExpense, type ExpenseSplit } from '@/domain/allocation'
import { bp } from '@/domain/bp'
import { poisha, sum } from '@/domain/money'
import type { ShareOwner, SplitOwner } from '@/domain/split'

// AGENT.md 17: O1, O2, O3 hold Building A at 5000/3000/2000 bp.
const owners: SplitOwner[] = [
  { ownerId: 'O1', sortOrder: 0 },
  { ownerId: 'O2', sortOrder: 1 },
  { ownerId: 'O3', sortOrder: 2 },
]
const shares: ShareOwner[] = [
  { ownerId: 'O1', bp: bp(5000), sortOrder: 0 },
  { ownerId: 'O2', bp: bp(3000), sortOrder: 1 },
  { ownerId: 'O3', bp: bp(2000), sortOrder: 2 },
]
const split = (fields: Partial<ExpenseSplit> & Pick<ExpenseSplit, 'amount'>): ExpenseSplit => ({
  splitRule: 'BY_SHARE',
  singleOwnerId: null,
  splitInputs: null,
  ...fields,
})
const amounts = (result: ReturnType<typeof allocateExpense>) => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value.map((a) => [a.ownerId, a.amount])
}

describe('allocateExpense (AGENT.md 8.3, 17.1)', () => {
  it('S1, S2: by share', () => {
    expect(amounts(allocateExpense(split({ amount: poisha(800000) }), { shares, owners }))).toEqual(
      [
        ['O1', 400000],
        ['O2', 240000],
        ['O3', 160000],
      ],
    )
    expect(amounts(allocateExpense(split({ amount: poisha(10001) }), { shares, owners }))).toEqual([
      ['O1', 5001],
      ['O2', 3000],
      ['O3', 2000],
    ])
  })

  it('S3: equally', () => {
    const result = allocateExpense(split({ amount: poisha(10000), splitRule: 'EQUAL' }), {
      shares,
      owners,
    })
    expect(amounts(result)).toEqual([
      ['O1', 3334],
      ['O2', 3333],
      ['O3', 3333],
    ])
  })

  it('S5, S6, S7: stores no zero allocations (D37)', () => {
    expect(amounts(allocateExpense(split({ amount: poisha(1) }), { shares, owners }))).toEqual([
      ['O1', 1],
    ])
    const single = split({ amount: poisha(300000), splitRule: 'SINGLE_OWNER', singleOwnerId: 'O2' })
    expect(amounts(allocateExpense(single, { shares, owners }))).toEqual([['O2', 300000]])
    const custom = split({
      amount: poisha(100000),
      splitRule: 'CUSTOM_AMOUNT',
      splitInputs: [
        { ownerId: 'O3', value: 0 },
        { ownerId: 'O2', value: 30000 },
        { ownerId: 'O1', value: 70000 },
      ],
    })
    expect(amounts(allocateExpense(custom, { shares, owners }))).toEqual([
      ['O1', 70000],
      ['O2', 30000],
    ])
  })

  it('breaks custom percentage ties by the owners sort order', () => {
    const custom = split({
      amount: poisha(1),
      splitRule: 'CUSTOM_PERCENT',
      splitInputs: [
        { ownerId: 'O3', value: 5000 },
        { ownerId: 'O1', value: 5000 },
      ],
    })
    expect(amounts(allocateExpense(custom, { shares: [], owners }))).toEqual([['O1', 1]])
  })

  it('needs shares only for the rules that use them', () => {
    expect(allocateExpense(split({ amount: poisha(100) }), { shares: [], owners })).toEqual({
      ok: false,
      errors: { splitRule: 'errors.split.noShares' },
    })
    const single = split({ amount: poisha(100), splitRule: 'SINGLE_OWNER', singleOwnerId: 'O3' })
    expect(amounts(allocateExpense(single, { shares: [], owners }))).toEqual([['O3', 100]])
  })

  it('allocates nothing to owners for a tenant-paid expense', () => {
    const tenant = split({ amount: poisha(5000), splitRule: 'TENANT_PAID' })
    expect(allocateExpense(tenant, { shares, owners })).toEqual({ ok: true, value: [] })
  })

  it('always sums to the amount', () => {
    for (let amount = 1; amount < 2000; amount += 7) {
      for (const splitRule of ['BY_SHARE', 'EQUAL'] as const) {
        const result = allocateExpense(split({ amount: poisha(amount), splitRule }), {
          shares,
          owners,
        })
        if (!result.ok) throw new Error('unexpected')
        expect(sum(result.value.map((a) => a.amount))).toBe(amount)
      }
    }
  })
})
