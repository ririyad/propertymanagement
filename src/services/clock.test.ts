import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentPeriod, todayInDhaka } from '@/services/clock'

describe('todayInDhaka', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('turns to the next day at midnight in Dhaka, 18:00 UTC', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T17:59:59Z'))
    expect(todayInDhaka()).toBe('2026-10-31')
    expect(currentPeriod()).toBe('2026-10')

    vi.setSystemTime(new Date('2026-10-31T18:00:00Z'))
    expect(todayInDhaka()).toBe('2026-11-01')
    expect(currentPeriod()).toBe('2026-11')
  })
})
