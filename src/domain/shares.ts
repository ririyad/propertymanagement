// Share resolution and share set validation (AGENT.md 8.1).
import { BP_WHOLE, totalBp } from '@/domain/bp'
import { inForce, type Period } from '@/domain/period'
import { fail, ok, type Errors, type Result } from '@/domain/result'
import type { ShareSet } from '@/domain/types'

/**
 * The non-deleted share set of a building in force for a period. When there is none,
 * expenses and earnings that need shares cannot be confirmed.
 */
export function shareSetFor<T extends Pick<ShareSet, 'buildingId' | 'effectiveFrom' | 'deletedAt'>>(
  sets: Iterable<T>,
  buildingId: string,
  period: Period,
): Result<T> {
  const candidates = [...sets].filter((s) => s.buildingId === buildingId && s.deletedAt === null)
  const set = inForce(candidates, period)
  return set ? ok(set) : fail({ shareSet: 'errors.shares.noneForPeriod' })
}

/**
 * Checks share entries before saving: at least one entry, every bp a positive integer,
 * no owner twice, and a total of exactly 10000. Field names follow the form (`entries.0.bp`).
 */
export function validateShareEntries(entries: readonly { ownerId: string; bp: number }[]): Errors {
  if (entries.length === 0) return { entries: 'errors.shares.noEntries' }

  const errors: Errors = {}
  const seen = new Set<string>()
  entries.forEach((entry, i) => {
    if (!Number.isInteger(entry.bp) || entry.bp <= 0) {
      errors[`entries.${i}.bp`] = 'errors.shares.bpPositive'
    }
    if (seen.has(entry.ownerId)) errors[`entries.${i}.ownerId`] = 'errors.shares.duplicateOwner'
    seen.add(entry.ownerId)
  })
  if (totalBp(entries.map((e) => e.bp)) !== BP_WHOLE) errors.entries = 'errors.shares.totalNot100'
  return errors
}
