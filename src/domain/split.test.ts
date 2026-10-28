import { describe, expect, it } from 'vitest'
import { bp } from '@/domain/bp'
import { poisha, sum } from '@/domain/money'
import { applySplitRule, percentHalfUp, splitByWeights, type ShareOwner } from '@/domain/split'

// AGENT.md 17: owners O1 (primary, sortOrder 0), O2 (1), O3 (2); Building A 5000/3000/2000 bp.
const buildingA: ShareOwner[] = [
  { ownerId: 'O1', sortOrder: 0, bp: bp(5000) },
  { ownerId: 'O2', sortOrder: 1, bp: bp(3000) },
  { ownerId: 'O3', sortOrder: 2, bp: bp(2000) },
]

function amounts(result: ReturnType<typeof applySplitRule>): number[] {
  if (!result.ok) throw new Error(`Expected ok, got ${JSON.stringify(result.errors)}`)
  return result.value.map((r) => r.amount)
}

describe('AGENT.md 17.1 split vectors', () => {
  it('S1: 800000 by share', () => {
    expect(
      amounts(applySplitRule({ amount: poisha(800000), rule: 'BY_SHARE', shares: buildingA })),
    ).toEqual([400000, 240000, 160000])
  })

  it('S2: 10001 by share', () => {
    expect(
      amounts(applySplitRule({ amount: poisha(10001), rule: 'BY_SHARE', shares: buildingA })),
    ).toEqual([5001, 3000, 2000])
  })

  it('S3: 10000 equal', () => {
    expect(
      amounts(applySplitRule({ amount: poisha(10000), rule: 'EQUAL', shares: buildingA })),
    ).toEqual([3334, 3333, 3333])
  })

  it('S4: -10001 by share', () => {
    expect(
      amounts(applySplitRule({ amount: poisha(-10001), rule: 'BY_SHARE', shares: buildingA })),
    ).toEqual([-5001, -3000, -2000])
  })

  it('S5: 1 by share', () => {
    expect(
      amounts(applySplitRule({ amount: poisha(1), rule: 'BY_SHARE', shares: buildingA })),
    ).toEqual([1, 0, 0])
  })

  it('S6: 300000 to a single owner', () => {
    expect(
      amounts(
        applySplitRule({
          amount: poisha(300000),
          rule: 'SINGLE_OWNER',
          shares: buildingA,
          singleOwnerId: 'O2',
        }),
      ),
    ).toEqual([0, 300000, 0])
  })

  it('S7: 100000 custom amounts', () => {
    expect(
      amounts(
        applySplitRule({
          amount: poisha(100000),
          rule: 'CUSTOM_AMOUNT',
          shares: buildingA,
          inputs: [
            { ownerId: 'O1', sortOrder: 0, value: 70000 },
            { ownerId: 'O2', sortOrder: 1, value: 30000 },
            { ownerId: 'O3', sortOrder: 2, value: 0 },
          ],
        }),
      ),
    ).toEqual([70000, 30000, 0])
  })
})

describe('splitByWeights', () => {
  it('gives everything to a single owner', () => {
    expect(splitByWeights(poisha(12345), [{ ownerId: 'O1', weight: 1, sortOrder: 0 }])).toEqual([
      { ownerId: 'O1', amount: 12345 },
    ])
  })

  it('splits zero into zeros', () => {
    expect(
      splitByWeights(poisha(0), [
        { ownerId: 'O1', weight: 1, sortOrder: 0 },
        { ownerId: 'O2', weight: 1, sortOrder: 1 },
      ]).map((r) => r.amount),
    ).toEqual([0, 0])
  })

  it('breaks equal remainders by larger weight first', () => {
    // 2 × 1/4 = 0.5 and 2 × 3/4 = 1.5: both remainders are 2/4, so the larger weight wins.
    expect(
      splitByWeights(poisha(2), [
        { ownerId: 'O1', weight: 1, sortOrder: 0 },
        { ownerId: 'O2', weight: 3, sortOrder: 1 },
      ]).map((r) => r.amount),
    ).toEqual([0, 2])
  })

  it('breaks equal remainders and weights by lower sortOrder', () => {
    expect(
      splitByWeights(poisha(1), [
        { ownerId: 'O1', weight: 1, sortOrder: 5 },
        { ownerId: 'O2', weight: 1, sortOrder: 3 },
      ]).map((r) => r.amount),
    ).toEqual([0, 1])
  })

  it('handles large amounts exactly', () => {
    const total = poisha(Number.MAX_SAFE_INTEGER)
    const result = splitByWeights(total, [
      { ownerId: 'O1', weight: 3333, sortOrder: 0 },
      { ownerId: 'O2', weight: 3333, sortOrder: 1 },
      { ownerId: 'O3', weight: 3334, sortOrder: 2 },
    ])
    expect(sum(result.map((r) => r.amount))).toBe(total)
  })

  it('accepts bigint weights', () => {
    expect(
      splitByWeights(poisha(4000), [
        { ownerId: 'W', weight: 5n, sortOrder: 0 },
        { ownerId: 'S', weight: 35n, sortOrder: 1 },
      ]).map((r) => r.amount),
    ).toEqual([500, 3500])
  })

  it('rejects empty, zero, negative and fractional weights', () => {
    expect(() => splitByWeights(poisha(1), [])).toThrow()
    expect(() => splitByWeights(poisha(1), [{ ownerId: 'O1', weight: 0, sortOrder: 0 }])).toThrow()
    expect(() => splitByWeights(poisha(1), [{ ownerId: 'O1', weight: -1, sortOrder: 0 }])).toThrow()
    expect(() =>
      splitByWeights(poisha(1), [{ ownerId: 'O1', weight: 0.5, sortOrder: 0 }]),
    ).toThrow()
  })

  it('always sums to the total (property test)', () => {
    // mulberry32, seeded so failures reproduce.
    let state = 20261027
    const random = (max: number) => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max)
    }
    for (let run = 0; run < 2000; run++) {
      const total = poisha(random(2_000_000_000) - 1_000_000_000)
      const owners = Array.from({ length: 1 + random(7) }, (_, i) => ({
        ownerId: `O${i}`,
        weight: 1 + random(10000),
        sortOrder: random(3),
      }))
      const result = splitByWeights(total, owners)
      expect(sum(result.map((r) => r.amount))).toBe(total)
      // Largest remainder never moves an owner more than one poisha from the exact share.
      const weightSum = owners.reduce((acc, o) => acc + o.weight, 0)
      result.forEach((r, i) => {
        const exact = (total * (owners[i]?.weight ?? 0)) / weightSum
        expect(Math.abs(r.amount - exact)).toBeLessThan(1)
      })
    }
  })
})

describe('applySplitRule', () => {
  it('returns no allocations for tenant-paid', () => {
    expect(
      applySplitRule({ amount: poisha(5000), rule: 'TENANT_PAID', shares: buildingA }),
    ).toEqual({ ok: true, value: [] })
  })

  it('orders results by sortOrder', () => {
    const shuffled = [buildingA[2], buildingA[0], buildingA[1]].filter((s) => s !== undefined)
    const result = applySplitRule({ amount: poisha(800000), rule: 'BY_SHARE', shares: shuffled })
    expect(result.ok && result.value.map((r) => r.ownerId)).toEqual(['O1', 'O2', 'O3'])
  })

  it('needs shares for by-share and equal splits', () => {
    for (const rule of ['BY_SHARE', 'EQUAL'] as const) {
      expect(applySplitRule({ amount: poisha(100), rule, shares: [] })).toEqual({
        ok: false,
        errors: { splitRule: 'errors.split.noShares' },
      })
    }
  })

  it('needs an owner for a single-owner split, who need not hold a share', () => {
    expect(
      applySplitRule({ amount: poisha(100), rule: 'SINGLE_OWNER', shares: buildingA }),
    ).toEqual({
      ok: false,
      errors: { singleOwnerId: 'errors.split.singleOwnerRequired' },
    })
    const result = applySplitRule({
      amount: poisha(100),
      rule: 'SINGLE_OWNER',
      shares: buildingA,
      singleOwnerId: 'O4',
    })
    expect(result.ok && result.value.at(-1)).toEqual({ ownerId: 'O4', amount: 100 })
  })

  it('splits custom percentages, giving 0% owners nothing', () => {
    expect(
      amounts(
        applySplitRule({
          amount: poisha(10001),
          rule: 'CUSTOM_PERCENT',
          shares: buildingA,
          inputs: [
            { ownerId: 'O1', sortOrder: 0, value: 7000 },
            { ownerId: 'O2', sortOrder: 1, value: 3000 },
            { ownerId: 'O3', sortOrder: 2, value: 0 },
          ],
        }),
      ),
    ).toEqual([7001, 3000, 0])
  })

  it('rejects custom percentages that do not total 100%', () => {
    expect(
      applySplitRule({
        amount: poisha(100),
        rule: 'CUSTOM_PERCENT',
        shares: buildingA,
        inputs: [{ ownerId: 'O1', sortOrder: 0, value: 9999 }],
      }),
    ).toEqual({ ok: false, errors: { splitInputs: 'errors.split.percentTotal' } })
  })

  it('rejects custom amounts that do not total the amount', () => {
    expect(
      applySplitRule({
        amount: poisha(100000),
        rule: 'CUSTOM_AMOUNT',
        shares: buildingA,
        inputs: [
          { ownerId: 'O1', sortOrder: 0, value: 70000 },
          { ownerId: 'O2', sortOrder: 1, value: 29999 },
        ],
      }),
    ).toEqual({ ok: false, errors: { splitInputs: 'errors.split.amountTotal' } })
  })

  it('rejects an owner listed twice', () => {
    expect(
      applySplitRule({
        amount: poisha(100),
        rule: 'CUSTOM_AMOUNT',
        shares: buildingA,
        inputs: [
          { ownerId: 'O1', sortOrder: 0, value: 50 },
          { ownerId: 'O1', sortOrder: 0, value: 50 },
        ],
      }),
    ).toEqual({ ok: false, errors: { splitInputs: 'errors.split.duplicateOwner' } })
  })
})

describe('percentHalfUp', () => {
  it('rounds half up', () => {
    expect(percentHalfUp(poisha(193400), bp(500))).toBe(9670) // 9670.0
    expect(percentHalfUp(poisha(10), bp(500))).toBe(1) // 0.5 rounds up
    expect(percentHalfUp(poisha(9), bp(500))).toBe(0) // 0.45 rounds down
    expect(percentHalfUp(poisha(-10), bp(500))).toBe(-1)
    expect(percentHalfUp(poisha(12345), bp(0))).toBe(0)
    expect(percentHalfUp(poisha(12345), bp(10000))).toBe(12345)
  })
})
