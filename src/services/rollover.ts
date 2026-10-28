import { db } from '@/data/db'
import { getMeta, setMeta } from '@/data/repositories/appMeta'
import { dhakaDateOf } from '@/domain/period'
import { generateDrafts } from '@/services/recurring'

const HOUR = 60 * 60 * 1000
/** Photos of deleted records are kept this long, so that undo and restore still find them. */
const BLOB_GRACE = 30 * 24 * HOUR

/** Removes the image data of photos deleted more than 30 days ago (AGENT.md 8.11). */
export async function cleanUpPhotoBlobs(now: number): Promise<number> {
  return db.transaction('rw', [db.attachment, db.attachmentBlob], async () => {
    const expired = await db.attachment
      .filter((a) => a.deletedAt !== null && now - a.deletedAt > BLOB_GRACE)
      .primaryKeys()
    await db.attachmentBlob.bulkDelete(expired)
    return expired.length
  })
}

/**
 * The rollover task (AGENT.md 11.1): recurring drafts up to this month and photo clean-up. It
 * runs when the app starts or comes back into view, at most once an hour, and is idempotent.
 */
export async function runRollover(now: number = Date.now(), force = false): Promise<boolean> {
  const last = await getMeta<number>('lastRolloverAt')
  if (!force && last !== undefined && last <= now && now - last < HOUR) return false
  await generateDrafts(dhakaDateOf(now))
  await cleanUpPhotoBlobs(now)
  await setMeta('lastRolloverAt', now)
  return true
}
