import type { NewPhoto, PhotoInput } from '@/services/attachments'

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8

/** Resizes a photo to a longest edge of 1600 px and encodes it as JPEG (AGENT.md 8.11). */
export async function resizePhoto(file: Blob): Promise<NewPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The browser has no 2D canvas')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('The photo could not be encoded')
  return { blob, width, height }
}

/** A photo in a form: one the record already has, or a new one not yet saved. */
export interface PhotoItem {
  key: string
  /** Set for a photo the record already has. */
  attachmentId?: string | undefined
  blob: Blob
  width: number
  height: number
}

export function toPhotoInput(photo: PhotoItem): PhotoInput {
  return photo.attachmentId
    ? { attachmentId: photo.attachmentId }
    : { blob: photo.blob, width: photo.width, height: photo.height }
}
