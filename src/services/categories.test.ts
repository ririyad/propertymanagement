import { beforeEach, describe, expect, it } from 'vitest'
import { listCategories } from '@/data/repositories/categories'
import { SYSTEM_CATEGORIES, seedCategories, type SystemCategoryKey } from '@/services/categories'
import { completeSetup, isSetupComplete } from '@/services/setup'
import { resetDb } from '@/test/db'

beforeEach(resetDb)

const names = Object.fromEntries(SYSTEM_CATEGORIES.map((c) => [c.key, c.key])) as Record<
  SystemCategoryKey,
  string
>

describe('seedCategories', () => {
  it('creates the eight system categories once (AGENT.md 7.7)', async () => {
    await seedCategories(names)
    await seedCategories(names)
    const categories = await listCategories()
    expect(categories).toHaveLength(8)
    expect(categories[0]).toMatchObject({
      id: 'system-electricity',
      kind: 'METER',
      defaultSplitRule: 'BY_SHARE',
      isSystem: true,
    })
  })
})

describe('setup', () => {
  it('records completion', async () => {
    expect(await isSetupComplete()).toBe(false)
    await completeSetup()
    expect(await isSetupComplete()).toBe(true)
  })
})
