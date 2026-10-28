import { dhakaDateOf, periodOf, type IsoDate, type Period } from '@/domain/period'

/** Today in Asia/Dhaka. The only place that reads the clock for a date (AGENT.md section 6). */
export function todayInDhaka(): IsoDate {
  return dhakaDateOf(Date.now())
}

/** The current month in Asia/Dhaka. */
export function currentPeriod(): Period {
  return periodOf(todayInDhaka())
}
