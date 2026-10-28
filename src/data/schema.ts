import type { Dexie, Transaction } from 'dexie'

export interface SchemaVersion {
  version: number
  /** Dexie store definitions added or changed in this version; `null` deletes a table. */
  stores: Record<string, string | null>
  upgrade?: (tx: Transaction) => Promise<void> | void
}

/**
 * Every schema version, oldest first (AGENT.md 7.8). Never edit a released version: add a new
 * one with an upgrade function and a migration test (see migrationHarness.ts).
 */
export const schemaVersions: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: {
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
  },
]

export const LATEST_VERSION = Math.max(...schemaVersions.map((v) => v.version))

/** Declares schema versions up to `upTo` on a Dexie instance. */
export function declareSchema(db: Dexie, upTo = LATEST_VERSION): void {
  for (const { version, stores, upgrade } of schemaVersions) {
    if (version > upTo) break
    const declared = db.version(version).stores(stores)
    if (upgrade) declared.upgrade(upgrade)
  }
}
