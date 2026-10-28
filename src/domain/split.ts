// The split engine (AGENT.md 8.2) and the only place, besides money.ts, that divides money.
import { BP_WHOLE, isBp, totalBp, type Bp } from '@/domain/bp'
import { neg, poisha, sum, ZERO, type Poisha } from '@/domain/money'
import { fail, ok, type Result } from '@/domain/result'
import type { SplitInput, SplitRule } from '@/domain/types'

export interface WeightedOwner {
  ownerId: string
  /** A positive integer. Faraid passes exact fractions on a common denominator as bigint. */
  weight: number | bigint
  sortOrder: number
}

export interface OwnerAmount {
  ownerId: string
  amount: Poisha
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function assertSumsTo(total: Poisha, results: readonly OwnerAmount[]): void {
  const allocated = sum(results.map((r) => r.amount))
  if (allocated !== total) {
    throw new Error(`Allocation of ${total} poisha sums to ${allocated} (AGENT.md 0.2 rule 4)`)
  }
}

/**
 * Divides a total by weights with largest-remainder rounding, so the results sum exactly to
 * the total. Ties go to the larger weight, then the lower sortOrder. Results keep input order.
 */
export function splitByWeights(total: Poisha, owners: readonly WeightedOwner[]): OwnerAmount[] {
  if (owners.length === 0) throw new Error('splitByWeights needs at least one owner')
  if (total < 0) {
    return splitByWeights(neg(total), owners).map((r) => ({
      ownerId: r.ownerId,
      amount: neg(r.amount),
    }))
  }

  const totalBig = BigInt(total)
  const weighted = owners.map((owner) => {
    const weight = BigInt(owner.weight)
    if (weight <= 0n) throw new RangeError(`Weight of ${owner.ownerId} must be positive`)
    return { owner, weight }
  })
  const weightSum = weighted.reduce((acc, w) => acc + w.weight, 0n)

  const rows = weighted.map(({ owner, weight }) => {
    const product = totalBig * weight
    return { owner, weight, amount: product / weightSum, fraction: product % weightSum }
  })

  let remainder = totalBig - rows.reduce((acc, row) => acc + row.amount, 0n)
  const ranked = [...rows].sort(
    (a, b) =>
      compareBigInt(b.fraction, a.fraction) ||
      compareBigInt(b.weight, a.weight) ||
      a.owner.sortOrder - b.owner.sortOrder,
  )
  for (const row of ranked) {
    if (remainder === 0n) break
    row.amount += 1n
    remainder -= 1n
  }

  const results = rows.map((row) => ({
    ownerId: row.owner.ownerId,
    amount: poisha(Number(row.amount)),
  }))
  assertSumsTo(total, results)
  return results
}

/**
 * A basis-point rate of an amount, rounded half-up to the poisha: (x × rate + 5000) div 10000
 * (AGENT.md 8.5 step 3). Negative amounts round symmetrically.
 */
export function percentHalfUp(amount: Poisha, rate: Bp): Poisha {
  if (amount < 0) return neg(percentHalfUp(neg(amount), rate))
  const whole = BigInt(BP_WHOLE)
  return poisha(Number((BigInt(amount) * BigInt(rate) + whole / 2n) / whole))
}

export interface SplitOwner {
  ownerId: string
  sortOrder: number
}

export interface ShareOwner extends SplitOwner {
  bp: Bp
}

export interface SplitRequest {
  amount: Poisha
  rule: SplitRule
  /** Entries of the share set in force for the record's building and period. */
  shares: readonly ShareOwner[]
  /** Required for `SINGLE_OWNER`. */
  singleOwnerId?: string | null
  /** Required for the custom rules: bp for `CUSTOM_PERCENT`, poisha for `CUSTOM_AMOUNT`. */
  inputs?: readonly (SplitInput & SplitOwner)[] | null
}

function bySortOrder(owners: readonly SplitOwner[], results: OwnerAmount[]): OwnerAmount[] {
  const order = new Map(owners.map((o) => [o.ownerId, o.sortOrder]))
  return results.sort((a, b) => (order.get(a.ownerId) ?? 0) - (order.get(b.ownerId) ?? 0))
}

function hasDuplicateOwner(owners: readonly SplitOwner[]): boolean {
  return new Set(owners.map((o) => o.ownerId)).size !== owners.length
}

/**
 * Applies a split rule (AGENT.md 8.2 table). Returns one amount per owner involved, zeros
 * included, ordered by sortOrder; `TENANT_PAID` returns no allocations. Errors are i18n keys.
 */
export function applySplitRule(request: SplitRequest): Result<OwnerAmount[]> {
  const { amount, rule, shares } = request

  switch (rule) {
    case 'TENANT_PAID':
      return ok([])

    case 'BY_SHARE':
    case 'EQUAL': {
      if (shares.length === 0) return fail({ splitRule: 'errors.split.noShares' })
      const weighted = shares.map((s) => ({ ...s, weight: rule === 'BY_SHARE' ? s.bp : 1 }))
      return ok(bySortOrder(shares, splitByWeights(amount, weighted)))
    }

    case 'SINGLE_OWNER': {
      const singleOwnerId = request.singleOwnerId
      if (!singleOwnerId) return fail({ singleOwnerId: 'errors.split.singleOwnerRequired' })
      const owners: SplitOwner[] = shares.some((s) => s.ownerId === singleOwnerId)
        ? [...shares]
        : [...shares, { ownerId: singleOwnerId, sortOrder: Number.MAX_SAFE_INTEGER }]
      const results = owners.map((o) => ({
        ownerId: o.ownerId,
        amount: o.ownerId === singleOwnerId ? amount : ZERO,
      }))
      return ok(bySortOrder(owners, results))
    }

    case 'CUSTOM_PERCENT': {
      const inputs = request.inputs ?? []
      if (inputs.length === 0) return fail({ splitInputs: 'errors.split.percentTotal' })
      if (hasDuplicateOwner(inputs)) return fail({ splitInputs: 'errors.split.duplicateOwner' })
      if (!inputs.every((i) => isBp(i.value)))
        return fail({ splitInputs: 'errors.split.invalidInput' })
      if (totalBp(inputs.map((i) => i.value)) !== BP_WHOLE) {
        return fail({ splitInputs: 'errors.split.percentTotal' })
      }
      const positive = inputs.filter((i) => i.value > 0)
      const split = new Map(
        splitByWeights(
          amount,
          positive.map((i) => ({ ...i, weight: i.value })),
        ).map((r) => [r.ownerId, r.amount]),
      )
      const results = inputs.map((i) => ({
        ownerId: i.ownerId,
        amount: split.get(i.ownerId) ?? ZERO,
      }))
      return ok(bySortOrder(inputs, results))
    }

    case 'CUSTOM_AMOUNT': {
      const inputs = request.inputs ?? []
      if (inputs.length === 0) return fail({ splitInputs: 'errors.split.amountTotal' })
      if (hasDuplicateOwner(inputs)) return fail({ splitInputs: 'errors.split.duplicateOwner' })
      if (!inputs.every((i) => Number.isSafeInteger(i.value))) {
        return fail({ splitInputs: 'errors.split.invalidInput' })
      }
      const results = inputs.map((i) => ({ ownerId: i.ownerId, amount: poisha(i.value) }))
      if (sum(results.map((r) => r.amount)) !== amount) {
        return fail({ splitInputs: 'errors.split.amountTotal' })
      }
      return ok(bySortOrder(inputs, results))
    }
  }
}
