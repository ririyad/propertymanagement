import { describe, expect, it } from 'vitest'
import { poisha } from '@/domain/money'
import { isoDate, period } from '@/domain/period'
import {
  formatBp,
  formatDate,
  formatPeriod,
  formatTaka,
  percentInputValue,
  takaInputValue,
} from '@/ui/format'

describe('formatTaka', () => {
  it.each([
    [15000000, '৳1,50,000'],
    [15000050, '৳1,50,000.50'],
    [203070, '৳2,030.70'],
    [100000000000, '৳1,00,00,00,000'],
    [5, '৳0.05'],
    [0, '৳0'],
    [-10001, '-৳100.01'],
  ])('formats %i poisha as %s', (amount, text) => {
    expect(formatTaka(poisha(amount))).toBe(text)
  })
})

describe('input values and dates', () => {
  it('formats amounts and percentages for prefilled inputs', () => {
    expect(takaInputValue(poisha(150050))).toBe('1500.50')
    expect(takaInputValue(poisha(1500000))).toBe('15000')
    expect(percentInputValue(3333)).toBe('33.33')
    expect(percentInputValue(1250)).toBe('12.5')
    expect(percentInputValue(5000)).toBe('50')
    expect(formatBp(505)).toBe('5.05%')
  })

  it('formats periods and dates', () => {
    expect(formatPeriod(period('2026-10'))).toBe('October 2026')
    expect(formatDate(isoDate('2026-03-05'))).toBe('5 Mar 2026')
  })
})
