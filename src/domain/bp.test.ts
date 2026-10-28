import { describe, expect, it } from 'vitest'
import { bp, isBp, totalBp } from '@/domain/bp'

describe('bp', () => {
  it('accepts integers from 0 to 10000', () => {
    expect(bp(0)).toBe(0)
    expect(bp(3333)).toBe(3333)
    expect(bp(10000)).toBe(10000)
  })

  it.each([-1, 10001, 33.33, Number.NaN])('rejects %d', (value) => {
    expect(isBp(value)).toBe(false)
    expect(() => bp(value)).toThrow(RangeError)
  })

  it('totals entries', () => {
    expect(totalBp([5000, 3000, 2000])).toBe(10000)
    expect(totalBp([])).toBe(0)
  })
})
