import { addMonths, isoDate, monthsBetween, type IsoDate, type Period } from '@/domain/period'
import type { RecurringTemplate } from '@/domain/types'

export type Schedule = Pick<RecurringTemplate, 'frequency' | 'startPeriod' | 'endPeriod'>

const STEP: Record<Schedule['frequency'], number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }

/** Whether a template creates a draft for period `p` (AGENT.md 8.6 rule 1). */
export function isDue(schedule: Schedule, p: Period): boolean {
  const since = monthsBetween(schedule.startPeriod, p)
  if (since < 0) return false
  if (schedule.endPeriod !== null && p > schedule.endPeriod) return false
  return since % STEP[schedule.frequency] === 0
}

/** The periods from the template's start up to `upTo` in which it is due, oldest first. */
export function duePeriods(schedule: Schedule, upTo: Period): Period[] {
  const last = schedule.endPeriod !== null && schedule.endPeriod < upTo ? schedule.endPeriod : upTo
  const periods: Period[] = []
  for (let p = schedule.startPeriod; p <= last; p = addMonths(p, STEP[schedule.frequency]))
    periods.push(p)
  return periods
}

/** A draft's date: the template's due day (1 to 28) of the period. */
export function draftDate(p: Period, dueDay: number): IsoDate {
  return isoDate(`${p}-${String(dueDay).padStart(2, '0')}`)
}
