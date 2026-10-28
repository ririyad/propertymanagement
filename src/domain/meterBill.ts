// Sub-meter reading rules (AGENT.md 8.4): units used since the previous reading, and the bill.
import { inForce, monthsBetween, type Period } from '@/domain/period'
import { fail, ok, type Result } from '@/domain/result'
import { computeBill, type BillBreakdown, type TariffRates } from '@/domain/tariff'

export interface ReadingInput {
  period: Period
  readingUnits: number
  isReset: boolean
  /** Units used entered by hand on a reset reading; without it a reset is a new baseline. */
  manualUnitsUsed?: number | null
}

export interface PriorReading {
  period: Period
  readingUnits: number
  unitsUsed: number | null
}

export type ReadingOutcome =
  | { kind: 'BASELINE' }
  | {
      kind: 'BILL'
      previous: PriorReading
      unitsUsed: number
      /** More than 1 when months were skipped: the bill covers all of them. */
      monthsCovered: number
      bill: BillBreakdown
      /** Units used are more than 3 times the average of the last 3 bills (warn, do not block). */
      highUsage: boolean
    }

function isUnits(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

/**
 * Validates a reading against the meter's other readings and computes its bill.
 * `history` holds the meter's other non-deleted readings (not the one being edited);
 * `tariffs` its non-deleted tariffs.
 */
export function computeReading(
  input: ReadingInput,
  history: readonly PriorReading[],
  tariffs: readonly (TariffRates & { effectiveFrom: Period })[],
): Result<ReadingOutcome> {
  if (!isUnits(input.readingUnits)) return fail({ readingUnits: 'errors.reading.invalidUnits' })

  const earlier = history
    .filter((r) => r.period < input.period)
    .sort((a, b) => (a.period < b.period ? 1 : -1))
  const previous = earlier[0]
  if (!previous) return ok({ kind: 'BASELINE' })

  let unitsUsed: number
  if (input.isReset) {
    const manual = input.manualUnitsUsed ?? null
    if (manual === null) return ok({ kind: 'BASELINE' })
    if (!isUnits(manual)) return fail({ manualUnitsUsed: 'errors.reading.invalidUnits' })
    unitsUsed = manual
  } else if (input.readingUnits < previous.readingUnits) {
    return fail({ readingUnits: 'errors.reading.lowerThanPrevious' })
  } else {
    unitsUsed = input.readingUnits - previous.readingUnits
  }

  const tariff = inForce(tariffs, input.period)
  if (!tariff) return fail({ tariff: 'errors.reading.noTariff' })

  const recentUnits = earlier
    .map((r) => r.unitsUsed)
    .filter((u): u is number => u !== null)
    .slice(0, 3)
  const recentTotal = recentUnits.reduce((acc, u) => acc + u, 0)
  const highUsage = recentUnits.length > 0 && unitsUsed * recentUnits.length > 3 * recentTotal

  return ok({
    kind: 'BILL',
    previous,
    unitsUsed,
    monthsCovered: monthsBetween(previous.period, input.period),
    bill: computeBill(tariff, unitsUsed),
    highUsage,
  })
}
