import type { Bp } from '@/domain/bp'
import { toTakaParts, type Poisha } from '@/domain/money'
import type { IsoDate, Period } from '@/domain/period'

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** Taka with lakh grouping, showing poisha only when there are any: ৳1,50,000 or ৳1,50,000.50. */
export function formatTaka(amount: Poisha): string {
  const { negative, taka, poisha } = toTakaParts(amount)
  const fraction = poisha === 0 ? '' : `.${String(poisha).padStart(2, '0')}`
  return `${negative ? '-' : ''}৳${grouping.format(taka)}${fraction}`
}

/** Meter units with grouping: 12450 gives "12,450". */
export function formatUnits(units: number): string {
  return grouping.format(units)
}

/** An amount as the user would type it, for prefilling inputs: 150050 gives "1500.50". */
export function takaInputValue(amount: Poisha): string {
  const { negative, taka, poisha } = toTakaParts(amount)
  const fraction = poisha === 0 ? '' : `.${String(poisha).padStart(2, '0')}`
  return `${negative ? '-' : ''}${taka}${fraction}`
}

/** Basis points as a percentage without trailing zeros: 3333 gives "33.33". */
export function percentInputValue(value: Bp | number): string {
  const whole = Math.trunc(value / 100)
  const fraction = String(value % 100)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

export function formatBp(value: Bp | number): string {
  return `${percentInputValue(value)}%`
}

const monthFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Dhaka',
})

/** An instant in Asia/Dhaka: "15 Oct 2026, 12:00". */
export function formatDateTime(epochMs: number): string {
  return dateTimeFormat.format(epochMs)
}

/** "October 2026". */
export function formatPeriod(p: Period): string {
  return monthFormat.format(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1, 1))
}

/** "5 Oct 2026". */
export function formatDate(date: IsoDate): string {
  const [year, month, day] = date.split('-').map(Number)
  return dateFormat.format(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
}
