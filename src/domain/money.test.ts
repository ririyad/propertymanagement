import { describe, expect, it } from 'vitest'
import {
  add,
  fromTaka,
  mulInt,
  neg,
  parseTaka,
  poisha,
  sub,
  sum,
  toTakaParts,
  ZERO,
} from '@/domain/money'

describe('poisha', () => {
  it('accepts safe integers', () => {
    expect(poisha(150050)).toBe(150050)
    expect(poisha(-1)).toBe(-1)
  })

  it('rejects fractions and unsafe integers', () => {
    expect(() => poisha(1.5)).toThrow(RangeError)
    expect(() => poisha(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError)
    expect(() => poisha(Number.NaN)).toThrow(RangeError)
  })

  it('normalises negative zero', () => {
    expect(Object.is(poisha(-0), 0)).toBe(true)
    expect(Object.is(neg(ZERO), 0)).toBe(true)
  })
})

describe('arithmetic', () => {
  it('adds, subtracts, negates and sums', () => {
    expect(add(poisha(100), poisha(250))).toBe(350)
    expect(sub(poisha(100), poisha(250))).toBe(-150)
    expect(neg(poisha(5))).toBe(-5)
    expect(sum([poisha(1), poisha(2), poisha(3)])).toBe(6)
    expect(sum([])).toBe(0)
  })

  it('multiplies by whole numbers only', () => {
    expect(mulInt(poisha(750), 280)).toBe(210000)
    expect(() => mulInt(poisha(750), 1.5)).toThrow(RangeError)
  })

  it('throws instead of losing precision', () => {
    expect(() => add(poisha(Number.MAX_SAFE_INTEGER), poisha(1))).toThrow(RangeError)
    expect(() => mulInt(poisha(Number.MAX_SAFE_INTEGER), 2)).toThrow(RangeError)
  })

  it('converts whole taka', () => {
    expect(fromTaka(8000)).toBe(800000)
  })
})

describe('toTakaParts', () => {
  it.each([
    [15000050, { negative: false, taka: 150000, poisha: 50 }],
    [5, { negative: false, taka: 0, poisha: 5 }],
    [0, { negative: false, taka: 0, poisha: 0 }],
    [-10001, { negative: true, taka: 100, poisha: 1 }],
    [Number.MAX_SAFE_INTEGER, { negative: false, taka: 90071992547409, poisha: 91 }],
  ])('%i', (amount, parts) => {
    expect(toTakaParts(poisha(amount))).toEqual(parts)
  })
})

describe('parseTaka', () => {
  it.each([
    ['1,500.5', 150050],
    ['1500', 150000],
    ['1,50,000', 15000000],
    ['150,000.75', 15000075],
    ['  42.1 ', 4210],
    ['.5', 50],
    ['7.', 700],
    ['0', 0],
    ['007.05', 705],
    ['৳1,500', 150000],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('parses %j as %i poisha', (text, expected) => {
    expect(parseTaka(text)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['', 'errors.money.required'],
    ['   ', 'errors.money.required'],
    ['.', 'errors.money.invalid'],
    ['abc', 'errors.money.invalid'],
    ['-5', 'errors.money.invalid'],
    ['1,,500', 'errors.money.invalid'],
    [',500', 'errors.money.invalid'],
    ['1 500', 'errors.money.invalid'],
    ['1e5', 'errors.money.invalid'],
    ['1.234', 'errors.money.tooManyDecimals'],
    ['90071992547409.92', 'errors.money.tooLarge'],
  ])('rejects %j', (text, error) => {
    expect(parseTaka(text)).toEqual({ ok: false, error })
  })
})
