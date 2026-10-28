import { describe, expect, it } from 'vitest'
import { period, type Period } from '@/domain/period'
import { draftDate, duePeriods, isDue, type Schedule } from '@/domain/recurring'

const schedule = (frequency: Schedule['frequency'], endPeriod: string | null = null): Schedule => ({
  frequency,
  startPeriod: period('2026-01'),
  endPeriod: endPeriod === null ? null : period(endPeriod),
})

const months = (...list: string[]): Period[] => list.map(period)

describe('isDue (AGENT.md 8.6 rule 1)', () => {
  it('is due every month from the start for a monthly template', () => {
    expect(isDue(schedule('MONTHLY'), period('2025-12'))).toBe(false)
    expect(isDue(schedule('MONTHLY'), period('2026-01'))).toBe(true)
    expect(isDue(schedule('MONTHLY'), period('2031-07'))).toBe(true)
  })

  it('is due every third month for a quarterly template', () => {
    const due = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-07', '2027-01'].filter((p) =>
      isDue(schedule('QUARTERLY'), period(p)),
    )
    expect(due).toEqual(['2026-01', '2026-04', '2026-07', '2027-01'])
  })

  it('is due every twelfth month for a yearly template', () => {
    expect(isDue(schedule('YEARLY'), period('2027-01'))).toBe(true)
    expect(isDue(schedule('YEARLY'), period('2026-12'))).toBe(false)
  })

  it('is not due after the end month', () => {
    expect(isDue(schedule('MONTHLY', '2026-03'), period('2026-03'))).toBe(true)
    expect(isDue(schedule('MONTHLY', '2026-03'), period('2026-04'))).toBe(false)
  })
})

describe('duePeriods', () => {
  it('lists the due months from the start up to the given month', () => {
    expect(duePeriods(schedule('MONTHLY'), period('2026-03'))).toEqual(
      months('2026-01', '2026-02', '2026-03'),
    )
    expect(duePeriods(schedule('QUARTERLY'), period('2026-10'))).toEqual(
      months('2026-01', '2026-04', '2026-07', '2026-10'),
    )
    expect(duePeriods(schedule('MONTHLY', '2026-02'), period('2026-10'))).toEqual(
      months('2026-01', '2026-02'),
    )
    expect(duePeriods(schedule('MONTHLY'), period('2025-12'))).toEqual([])
  })
})

describe('draftDate', () => {
  it('is the due day of the month', () => {
    expect(draftDate(period('2026-02'), 28)).toBe('2026-02-28')
    expect(draftDate(period('2026-10'), 5)).toBe('2026-10-05')
  })
})
