import { describe, expect, it } from 'vitest'
import { parseUnits } from '@/domain/units'

describe('parseUnits', () => {
  it.each([
    ['12450', 12450],
    [' 12,450 ', 12450],
    ['0', 0],
  ])('reads %j as %d', (text, expected) => {
    expect(parseUnits(text)).toEqual({ ok: true, value: expected })
  })

  it.each([
    ['', 'errors.units.required'],
    ['  ', 'errors.units.required'],
    ['12.5', 'errors.units.invalid'],
    ['-3', 'errors.units.invalid'],
    [',', 'errors.units.invalid'],
    ['1e3', 'errors.units.invalid'],
    ['99999999999999999999', 'errors.units.invalid'],
  ])('rejects %j', (text, error) => {
    expect(parseUnits(text)).toEqual({ ok: false, error })
  })
})
