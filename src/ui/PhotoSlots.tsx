import { Camera, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_PHOTOS } from '@/services/attachments'
import { cn } from '@/ui/cn'
import { Button } from '@/ui/components/button'
import { ErrorText } from '@/ui/Field'
import { resizePhoto, type PhotoItem } from '@/ui/photos'

/**
 * Two photo slots (AGENT.md 8.11). The file input has no `capture` attribute, so Android offers
 * both the camera and the gallery. New photos are resized before they are kept.
 */
export function PhotoSlots({
  photos,
  onChange,
  error,
  compact = false,
}: {
  photos: PhotoItem[]
  onChange: (photos: PhotoItem[]) => void
  error?: string | undefined
  /** Smaller slots, for a screen with many records such as the readings list. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [unreadable, setUnreadable] = useState(false)

  const add = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setUnreadable(false)
    try {
      const photo = await resizePhoto(file)
      onChange([...photos, { key: crypto.randomUUID(), ...photo }])
    } catch {
      setUnreadable(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">{t('photos.label')}</legend>
      <div className={cn('grid gap-3', compact ? 'grid-cols-3' : 'grid-cols-2')}>
        {photos.map((photo, i) => (
          <div
            key={photo.key}
            className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted"
          >
            <Thumbnail blob={photo.blob} alt={t('photos.photo', { number: i + 1 })} />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1 right-1 bg-background/90"
              aria-label={t('photos.remove', { number: i + 1 })}
              onClick={() => onChange(photos.filter((p) => p.key !== photo.key))}
            >
              <X aria-hidden />
            </Button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent">
            <Camera aria-hidden className="size-6" />
            {busy ? t('photos.adding') : t('photos.add')}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void add(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        )}
      </div>
      {unreadable && <ErrorText error="errors.photos.unreadable" />}
      <ErrorText error={error} />
    </fieldset>
  )
}

/** Shows a stored image through an object URL that is revoked when the image goes away. */
function Thumbnail({ blob, alt }: { blob: Blob; alt: string }) {
  const show = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return
      const url = URL.createObjectURL(blob)
      img.src = url
      return () => URL.revokeObjectURL(url)
    },
    [blob],
  )
  return <img ref={show} alt={alt} className="size-full object-cover" />
}
