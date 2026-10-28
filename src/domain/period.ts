/** A calendar month as `YYYY-MM`. Months are always counted in Asia/Dhaka (AGENT.md 0.2 rule 8). */
export type Period = string & { readonly __brand: 'Period' }

/** A calendar date as `YYYY-MM-DD`, already in Asia/Dhaka. */
export type IsoDate = string & { readonly __brand: 'IsoDate' }

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/
const DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/

export function isPeriod(text: string): text is Period {
  return PERIOD_PATTERN.test(text)
}

export function period(text: string): Period {
  if (!isPeriod(text)) throw new RangeError(`Not a period (YYYY-MM): ${text}`)
  return text
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function isIsoDate(text: string): text is IsoDate {
  const match = DATE_PATTERN.exec(text)
  if (!match) return false
  const day = Number(match[3])
  return day >= 1 && day <= daysInMonth(Number(match[1]), Number(match[2]))
}

export function isoDate(text: string): IsoDate {
  if (!isIsoDate(text)) throw new RangeError(`Not a date (YYYY-MM-DD): ${text}`)
  return text
}

function monthIndex(p: Period): number {
  return Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1
}

function fromMonthIndex(index: number): Period {
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  return period(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)
}

export function addMonths(p: Period, months: number): Period {
  if (!Number.isInteger(months)) throw new RangeError(`Not a whole number of months: ${months}`)
  return fromMonthIndex(monthIndex(p) + months)
}

/** Number of months from `from` to `to`: monthsBetween('2026-01', '2026-03') = 2. */
export function monthsBetween(from: Period, to: Period): number {
  return monthIndex(to) - monthIndex(from)
}

export function periodOf(date: IsoDate): Period {
  return period(date.slice(0, 7))
}

const dhakaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar date in Asia/Dhaka at an instant (epoch milliseconds). */
export function dhakaDateOf(epochMs: number): IsoDate {
  const parts = dhakaDate.formatToParts(epochMs)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return isoDate(`${part('year')}-${part('month')}-${part('day')}`)
}

/** The record in force for a period: the greatest `effectiveFrom` that is not after it. */
export function inForce<T extends { effectiveFrom: Period }>(
  records: Iterable<T>,
  p: Period,
): T | undefined {
  let best: T | undefined
  for (const record of records) {
    if (record.effectiveFrom <= p && (!best || record.effectiveFrom > best.effectiveFrom)) {
      best = record
    }
  }
  return best
}
