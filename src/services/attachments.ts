import { db } from '@/data/db'
import { newRecord } from '@/data/records'
import { listAttachments } from '@/data/repositories/attachments'
import type { Attachment, AttachmentRecordType } from '@/domain/types'

/** At most two photos per record (AGENT.md 8.10, 8.11). */
export const MAX_PHOTOS = 2

export interface NewPhoto {
  blob: Blob
  width: number
  height: number
}

/** A photo to keep on a record: one it already has, or a new one. */
export type PhotoInput = { attachmentId: string } | NewPhoto

export const attachmentTables = () => [db.attachment, db.attachmentBlob]

/**
 * Makes a record's photos match the list, in order, inside the caller's transaction: photos
 * left out are soft-deleted and new ones are stored with their image data (AGENT.md 8.11).
 */
export async function replacePhotos(
  recordType: AttachmentRecordType,
  recordId: string,
  photos: readonly PhotoInput[],
  now: number,
): Promise<void> {
  if (photos.length > MAX_PHOTOS) throw new RangeError(`At most ${MAX_PHOTOS} photos`)
  const existing = await listAttachments(recordType, recordId)
  const kept = new Set(photos.flatMap((p) => ('attachmentId' in p ? [p.attachmentId] : [])))
  await db.attachment.bulkPut(
    existing.filter((a) => !kept.has(a.id)).map((a) => ({ ...a, deletedAt: now, updatedAt: now })),
  )

  for (const [index, photo] of photos.entries()) {
    const position = index === 0 ? 0 : 1
    if ('attachmentId' in photo) {
      const attachment = existing.find((a) => a.id === photo.attachmentId)
      if (attachment && attachment.position !== position)
        await db.attachment.put({ ...attachment, position, updatedAt: now })
      continue
    }
    const attachment = newRecord<Attachment>(
      {
        recordType,
        recordId,
        mimeType: photo.blob.type || 'image/jpeg',
        sizeBytes: photo.blob.size,
        width: photo.width,
        height: photo.height,
        driveFileId: null,
        position,
      },
      now,
    )
    await db.attachment.add(attachment)
    await db.attachmentBlob.add({ id: attachment.id, blob: photo.blob })
  }
}

/** Soft-deletes a record's photos with the record; returns their ids for undo. */
export async function deletePhotos(
  recordType: AttachmentRecordType,
  recordId: string,
  now: number,
): Promise<string[]> {
  const attachments = await listAttachments(recordType, recordId)
  await db.attachment.bulkPut(attachments.map((a) => ({ ...a, deletedAt: now, updatedAt: now })))
  return attachments.map((a) => a.id)
}

export async function restorePhotos(ids: readonly string[], now: number): Promise<void> {
  const attachments = (await db.attachment.bulkGet([...ids])).filter((a) => a !== undefined)
  await db.attachment.bulkPut(attachments.map((a) => ({ ...a, deletedAt: null, updatedAt: now })))
}
