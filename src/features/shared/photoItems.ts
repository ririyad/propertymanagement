import { getAttachmentBlob, listAttachments } from '@/data/repositories/attachments'
import type { AttachmentRecordType } from '@/domain/types'
import type { PhotoItem } from '@/ui/photos'

/** A record's stored photos, ready for PhotoSlots. */
export async function loadPhotoItems(
  recordType: AttachmentRecordType,
  recordId: string,
): Promise<PhotoItem[]> {
  const photos: PhotoItem[] = []
  for (const { id, width, height } of await listAttachments(recordType, recordId)) {
    const blob = await getAttachmentBlob(id)
    if (blob) photos.push({ key: id, attachmentId: id, blob, width, height })
  }
  return photos
}
