import { describe, expect, it } from 'vitest'
import {
  addMonths,
  dhakaDateOf,
  inForce,
  isIsoDate,
  isPeriod,
  isoDate,
  monthsBetween,
  period,
  periodOf,
} from '@/domain/period'

describe('period', () => {
  it('accepts YYYY-MM', () => {
    expect(period('2026-03')).toBe('2026-03')
  })

  it.each(['2026-13', '2026-00', '2026-3', '26-03', '2026-03-01', ''])('rejects %j', (text) => {
    expect(isPeriod(text)).toBe(false)
    expect(() => period(text)).toThrow(RangeError)
  })
})

describe('isoDate', () => {
  it.each(['2026-03-05', '2024-02-29', '2000-02-29', '2026-12-31'])('accepts %s', (text) => {
    expect(isoDate(text)).toBe(text)
  })

  it.each(['2026-02-29', '1900-02-29', '2026-04-31', '2026-03-00', '2026-3-5', '2026-03'])(
    'rejects %s',
    (text) => {
      expect(isIsoDate(text)).toBe(false)
    },
  )
})

describe('month arithmetic', () => {
  it('adds months across years', () => {
    expect(addMonths(period('2026-11'), 3)).toBe('2027-02')
    expect(addMonths(period('2026-01'), -1)).toBe('2025-12')
    expect(addMonths(period('2026-03'), 0)).toBe('2026-03')
    expect(addMonths(period('2026-03'), -27)).toBe('2023-12')
  })

  it('counts months between periods', () => {
    expect(monthsBetween(period('2026-01'), period('2026-03'))).toBe(2)
    expect(monthsBetween(period('2025-11'), period('2026-02'))).toBe(3)
    expect(monthsBetween(period('2026-03'), period('2026-01'))).toBe(-2)
  })

  it('takes the period of a date', () => {
    expect(periodOf(isoDate('2026-03-05'))).toBe('2026-03')
  })
})

describe('dhakaDateOf', () => {
  it('uses Asia/Dhaka (UTC+6), not UTC', () => {
    expect(dhakaDateOf(Date.UTC(2026, 9, 31, 17, 59, 59))).toBe('2026-10-31')
    expect(dhakaDateOf(Date.UTC(2026, 9, 31, 18, 0, 0))).toBe('2026-11-01')
    expect(dhakaDateOf(Date.UTC(2026, 11, 31, 18, 30))).toBe('2027-01-01')
  })
})

describe('inForce', () => {
  const records = [
    { id: 'b', effectiveFrom: period('2026-06') },
    { id: 'a', effectiveFrom: period('2026-01') },
    { id: 'c', effectiveFrom: period('2027-01') },
  ]

  it('picks the latest effectiveFrom not after the period', () => {
    expect(inForce(records, period('2026-05'))?.id).toBe('a')
    expect(inForce(records, period('2026-06'))?.id).toBe('b')
    expect(inForce(records, period('2026-12'))?.id).toBe('b')
    expect(inForce(records, period('2030-01'))?.id).toBe('c')
  })

  it('returns undefined before the first record', () => {
    expect(inForce(records, period('2025-12'))).toBeUndefined()
    expect(inForce([], period('2026-01'))).toBeUndefined()
  })
})
