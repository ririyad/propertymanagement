// Test helper for schema upgrades (AGENT.md 7.8, 14). Used only from *.test.ts files.
import { Dexie } from 'dexie'
import { LedgerDb } from './db'
import { declareSchema } from './schema'

/**
 * Creates a database at an older schema version, lets `seed` write records shaped as they
 * were then, and reopens it with the current schema so every upgrade function runs.
 */
export async function migrateFrom(
  fromVersion: number,
  seed: (old: Dexie) => Promise<void>,
): Promise<LedgerDb> {
  const name = `migration-test-${crypto.randomUUID()}`
  const old = new Dexie(name)
  declareSchema(old, fromVersion)
  await old.open()
  await seed(old)
  old.close()

  const db = new LedgerDb(name)
  await db.open()
  return db
}
