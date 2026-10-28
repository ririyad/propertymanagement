import { describe, expect, it } from 'vitest'
import { poisha } from '@/domain/money'
import { formatTaka } from '@/ui/format'

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
