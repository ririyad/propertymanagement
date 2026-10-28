import { afterEach, describe, expect, it } from 'vitest'
import { LedgerDb } from './db'
import { migrateFrom } from './migrationHarness'
import { LATEST_VERSION, schemaVersions } from './schema'

// A copy of every released version. Changing a released version breaks existing installs:
// add a new version instead, then append it here (AGENT.md 7.8).
const RELEASED: Record<number, Record<string, string | null>> = {
  1: {
    owner: 'id, sortOrder',
    buildingGroup: 'id',
    building: 'id, groupId, sortOrder',
    shareSet: 'id, buildingId, [buildingId+effectiveFrom]',
    shareEntry: 'id, shareSetId, ownerId',
    meter: 'id, buildingId, parentMeterId',
    tariff: 'id, meterId, [meterId+effectiveFrom]',
    meterReading: 'id, meterId, [meterId+period], period',
    expenseCategory: 'id, sortOrder',
    recurringTemplate: 'id, buildingId, isActive',
    expense:
      'id, period, [buildingId+period], categoryId, meterId, [templateId+period], status, paidByOwnerId',
    expenseAllocation: 'id, expenseId, ownerId',
    attachment: 'id, [recordType+recordId]',
    attachmentBlob: 'id',
    appMeta: 'key',
  },
}

const opened: LedgerDb[] = []

afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

describe('schema', () => {
  it('keeps released versions unchanged', () => {
    for (const { version, stores } of schemaVersions) {
      if (version in RELEASED) expect(stores, `version ${version}`).toEqual(RELEASED[version])
    }
  })

  it('numbers versions in increasing order', () => {
    const versions = schemaVersions.map((v) => v.version)
    expect(versions).toEqual([...versions].sort((a, b) => a - b))
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('opens at the latest version with every table and index', async () => {
    const db = new LedgerDb(`schema-test-${crypto.randomUUID()}`)
    opened.push(db)
    await db.open()

    expect(db.verno).toBe(LATEST_VERSION)
    const expense = db.table('expense').schema
    expect(expense.primKey.name).toBe('id')
    expect(expense.indexes.map((i) => i.name)).toEqual([
      'period',
      '[buildingId+period]',
      'categoryId',
      'meterId',
      '[templateId+period]',
      'status',
      'paidByOwnerId',
    ])
    expect(db.table('appMeta').schema.primKey.name).toBe('key')
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      Object.keys(schemaVersions.reduce((all, v) => ({ ...all, ...v.stores }), {})).sort(),
    )
  })

  it('finds records through compound indexes', async () => {
    const db = new LedgerDb(`schema-test-${crypto.randomUUID()}`)
    opened.push(db)
    await db.appMeta.put({ key: 'lastRolloverAt', value: 1 })
    await db.table('expense').bulkPut([
      { id: 'e1', buildingId: 'A', period: '2026-10', templateId: 't1' },
      { id: 'e2', buildingId: 'A', period: '2026-11', templateId: null },
      { id: 'e3', buildingId: 'B', period: '2026-10', templateId: 't1' },
    ])

    const keys = await db.expense
      .where('[buildingId+period]')
      .equals(['A', '2026-10'])
      .primaryKeys()
    expect(keys).toEqual(['e1'])
    expect(await db.expense.where('[templateId+period]').equals(['t1', '2026-10']).count()).toBe(2)
    expect(await db.appMeta.get('lastRolloverAt')).toEqual({ key: 'lastRolloverAt', value: 1 })
  })
})

describe('migrateFrom', () => {
  it('keeps data written at an older version', async () => {
    const db = await migrateFrom(1, async (old) => {
      await old.table('owner').put({ id: 'O1', name: 'Emon', sortOrder: 0, deletedAt: null })
    })
    opened.push(db)

    expect(db.verno).toBe(LATEST_VERSION)
    expect(await db.owner.get('O1')).toMatchObject({ name: 'Emon' })
  })
})
