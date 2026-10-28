import { describe, expect, it } from 'vitest'
import { period, type Period } from '@/domain/period'
import { shareSetFor, validateShareEntries } from '@/domain/shares'

function set(
  id: string,
  buildingId: string,
  effectiveFrom: Period,
  deletedAt: number | null = null,
) {
  return { id, buildingId, effectiveFrom, deletedAt }
}

describe('shareSetFor', () => {
  const sets = [
    set('A-2026-01', 'A', period('2026-01')),
    set('A-2026-07', 'A', period('2026-07')),
    set('A-2026-05-deleted', 'A', period('2026-05'), 1),
    set('B-2025-01', 'B', period('2025-01')),
  ]

  it('returns the set with the greatest effectiveFrom not after the period', () => {
    const at = (p: string) => {
      const result = shareSetFor(sets, 'A', period(p))
      return result.ok ? result.value.id : result.errors
    }
    expect(at('2026-01')).toBe('A-2026-01')
    expect(at('2026-06')).toBe('A-2026-01')
    expect(at('2026-07')).toBe('A-2026-07')
    expect(at('2031-01')).toBe('A-2026-07')
  })

  it('ignores soft-deleted sets and other buildings', () => {
    const result = shareSetFor(sets, 'A', period('2026-05'))
    expect(result.ok && result.value.id).toBe('A-2026-01')
  })

  it('fails before the first set', () => {
    expect(shareSetFor(sets, 'A', period('2025-12'))).toEqual({
      ok: false,
      errors: { shareSet: 'errors.shares.noneForPeriod' },
    })
    expect(shareSetFor(sets, 'C', period('2026-01')).ok).toBe(false)
  })
})

describe('validateShareEntries', () => {
  it('accepts entries that total 10000', () => {
    expect(
      validateShareEntries([
        { ownerId: 'O1', bp: 5000 },
        { ownerId: 'O2', bp: 3000 },
        { ownerId: 'O3', bp: 2000 },
      ]),
    ).toEqual({})
    expect(validateShareEntries([{ ownerId: 'O1', bp: 10000 }])).toEqual({})
  })

  it('needs at least one entry', () => {
    expect(validateShareEntries([])).toEqual({ entries: 'errors.shares.noEntries' })
  })

  it('needs a total of exactly 10000', () => {
    expect(
      validateShareEntries([
        { ownerId: 'O1', bp: 5000 },
        { ownerId: 'O2', bp: 4999 },
      ]),
    ).toEqual({ entries: 'errors.shares.totalNot100' })
  })

  it('needs every bp to be a positive integer', () => {
    expect(
      validateShareEntries([
        { ownerId: 'O1', bp: 10000 },
        { ownerId: 'O2', bp: 0 },
      ]),
    ).toEqual({ 'entries.1.bp': 'errors.shares.bpPositive' })
    expect(
      validateShareEntries([
        { ownerId: 'O1', bp: 5000.5 },
        { ownerId: 'O2', bp: 4999.5 },
      ]),
    ).toMatchObject({ 'entries.0.bp': 'errors.shares.bpPositive' })
  })

  it('rejects an owner listed twice', () => {
    expect(
      validateShareEntries([
        { ownerId: 'O1', bp: 5000 },
        { ownerId: 'O1', bp: 5000 },
      ]),
    ).toEqual({ 'entries.1.ownerId': 'errors.shares.duplicateOwner' })
  })
})
