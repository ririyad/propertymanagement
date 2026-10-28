import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { Attachment, AttachmentRecordType } from '@/domain/types'

/** A record's photos in slot order. */
export async function listAttachments(
  recordType: AttachmentRecordType,
  recordId: string,
): Promise<Attachment[]> {
  const attachments = await db.attachment
    .where('[recordType+recordId]')
    .equals([recordType, recordId])
    .toArray()
  return attachments.filter(isLive).sort((a, b) => a.position - b.position)
}

export async function getAttachmentBlob(id: string): Promise<Blob | undefined> {
  return (await db.attachmentBlob.get(id))?.blob
}
