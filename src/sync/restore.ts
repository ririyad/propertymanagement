import { db } from '@/data/db'
import { fromBase64, type Backup } from '@/sync/backupFile'

/**
 * Replaces all data on this device with a checked backup, in one transaction (AGENT.md 12.4).
 * A backup without photos keeps the photo data already here for the photos it lists.
 */
export async function restoreBackup(backup: Backup): Promise<void> {
  const photos = backup.photos.map((photo) => ({ id: photo.id, blob: fromBase64(photo) }))
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables)
      if (table.name !== db.attachmentBlob.name || backup.manifest.photos) await table.clear()
    for (const [name, rows] of Object.entries(backup.tables)) await db.table(name).bulkAdd(rows)

    if (backup.manifest.photos) await db.attachmentBlob.bulkAdd(photos)
    else {
      const listed = new Set(await db.attachment.toCollection().primaryKeys())
      const kept = await db.attachmentBlob.toCollection().primaryKeys()
      await db.attachmentBlob.bulkDelete(kept.filter((id) => !listed.has(id)))
    }
  })
}
