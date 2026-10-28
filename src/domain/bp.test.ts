import { describe, expect, it } from 'vitest'
import { bp, isBp, parsePercent, totalBp } from '@/domain/bp'

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

describe('parsePercent', () => {
  it.each([
    ['50', 5000],
    ['33.33', 3333],
    ['12.5', 1250],
    ['100', 10000],
    ['0', 0],
    ['.5', 50],
    [' 20 % ', 2000],
  ])('parses %j as %i bp', (text, expected) => {
    expect(parsePercent(text)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['', 'errors.percent.required'],
    ['abc', 'errors.percent.invalid'],
    ['-5', 'errors.percent.invalid'],
    ['1000', 'errors.percent.invalid'],
    ['33.333', 'errors.percent.tooManyDecimals'],
    ['100.01', 'errors.percent.outOfRange'],
  ])('rejects %j', (text, error) => {
    expect(parsePercent(text)).toEqual({ ok: false, error })
  })
})
