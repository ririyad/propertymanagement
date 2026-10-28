import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { LATEST_VERSION } from '@/data/schema'
import { poisha } from '@/domain/money'
import { isoDate } from '@/domain/period'
import { saveExpense } from '@/services/expenses'
import {
  backupFileName,
  createBackup,
  decodeBackup,
  encodeBackup,
  type Backup,
} from '@/sync/backupFile'
import { restoreBackup } from '@/sync/restore'
import { resetDb, seedBuildingA, seedSystemCategories, unwrap } from '@/test/db'

const NOW = Date.parse('2026-10-15T06:00:00Z')
const today = isoDate('2026-10-15')

beforeEach(async () => {
  await resetDb()
  await seedSystemCategories()
})

/** Every row of every table, photo data as bytes, in a stable order. */
async function dump() {
  const all: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    const rows = (await table.toArray()) as Record<string, unknown>[]
    const plain = await Promise.all(
      rows.map(async (row) =>
        row.blob instanceof Blob
          ? { ...row, blob: [...new Uint8Array(await row.blob.arrayBuffer())] }
          : row,
      ),
    )
    all[table.name] = plain.sort((a, b) =>
      String(a.id ?? a.key).localeCompare(String(b.id ?? b.key)),
    )
  }
  return all
}

async function seedWithPhoto() {
  const { building, o1 } = await seedBuildingA()
  const expense = unwrap(
    await saveExpense(
      {
        buildingId: building.id,
        categoryId: 'system-caretaker',
        period: '2026-10',
        date: '2026-10-05',
        amount: poisha(800000),
        isPaid: true,
        paidByOwnerId: o1.id,
        splitRule: 'BY_SHARE',
        photos: [
          {
            blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }),
            width: 4,
            height: 3,
          },
        ],
      },
      today,
    ),
  )
  return { expense }
}

describe('backup file (AGENT.md 12.6)', () => {
  it('restores every table and photo exactly', async () => {
    await seedWithPhoto()
    const before = await dump()
    const backup = await createBackup(true, NOW)
    expect(backup.manifest).toMatchObject({
      schemaVersion: LATEST_VERSION,
      createdAt: NOW,
      photos: true,
    })
    expect(backup.manifest.rowCounts).toMatchObject({
      owner: 3,
      expense: 1,
      expenseAllocation: 3,
      attachment: 1,
    })
    expect(backup.photos).toHaveLength(1)

    const file = await encodeBackup(backup)
    await resetDb()
    await restoreBackup(unwrap(await decodeBackup(file)))
    expect(await dump()).toEqual(before)
  })

  it('without photos, keeps the photo data already on the device for the photos it lists', async () => {
    await seedWithPhoto()
    const before = await dump()
    const backup = await createBackup(false, NOW)
    expect(backup.photos).toEqual([])
    await db.attachmentBlob.add({ id: 'stray', blob: new Blob(['x']) })
    await restoreBackup(unwrap(await decodeBackup(await encodeBackup(backup))))
    expect(await dump()).toEqual(before)
  })

  it('replaces what the device had', async () => {
    const backup = await createBackup(false, NOW)
    await seedWithPhoto()
    await restoreBackup(unwrap(await decodeBackup(await encodeBackup(backup))))
    expect(await db.owner.count()).toBe(0)
    expect(await db.expenseCategory.count()).toBe(8)
  })

  it('rejects a file that is not a backup, is damaged or is from a newer version', async () => {
    await seedWithPhoto()
    const encode = async (change: (backup: Backup) => void) => {
      const backup = await createBackup(false, NOW)
      change(backup)
      return decodeBackup(await encodeBackup(backup))
    }
    const notBackup = { ok: false, errors: { file: 'errors.backup.notBackup' } }
    expect(await decodeBackup(new Blob(['plain text']))).toEqual(notBackup)
    const json = new Blob(['{"hello":1}']).stream().pipeThrough(new CompressionStream('gzip'))
    expect(await decodeBackup(await new Response(json).blob())).toEqual(notBackup)
    expect(
      await encode((b) => {
        const owner = b.tables.owner?.[0]
        if (owner) owner.name = 'Someone else'
      }),
    ).toEqual({ ok: false, errors: { file: 'errors.backup.damaged' } })
    expect(
      await encode((b) => {
        b.manifest.schemaVersion = LATEST_VERSION + 1
      }),
    ).toEqual({ ok: false, errors: { file: 'errors.backup.newerVersion' } })
    expect(
      await encode((b) => {
        b.tables.lease = []
      }),
    ).toEqual({ ok: false, errors: { file: 'errors.backup.newerVersion' } })
  })

  it('names the file by its time in Asia/Dhaka', () => {
    expect(backupFileName(NOW)).toBe('PropertyLedger_Backup_2026-10-15_1200.json.gz')
  })
})
