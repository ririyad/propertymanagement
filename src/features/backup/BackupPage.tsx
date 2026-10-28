import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { isSetupComplete } from '@/services/setup'
import {
  backupFileName,
  createBackup,
  decodeBackup,
  encodeBackup,
  type Backup,
} from '@/sync/backupFile'
import { restoreBackup } from '@/sync/restore'
import { Button } from '@/ui/components/button'
import { Card } from '@/ui/components/card'
import { CheckboxField, ErrorText } from '@/ui/Field'
import { formatDateTime } from '@/ui/format'
import { PageHeader } from '@/ui/PageHeader'
import { shareOrDownload } from '@/ui/shareFile'
import { useToast } from '@/ui/toastContext'

/**
 * Saves all data to a backup file and restores one (`/backup`), AGENT.md 12.6, P1-T13. It sits
 * outside the setup gate so that a new phone can restore before setting anything up.
 */
export function BackupPage() {
  const { t } = useTranslation()
  const setupDone = useLiveQuery(isSetupComplete, [])
  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-12">
      <PageHeader title={t('backup.title')} back={setupDone ? '/more' : '/setup'} />
      <div className="grid gap-8">
        <SaveBackup />
        <RestoreBackup />
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function SaveBackup() {
  const { t } = useTranslation()
  const toast = useToast()
  const [includePhotos, setIncludePhotos] = useState(false)
  const [busy, setBusy] = useState(false)

  const onSave = async () => {
    setBusy(true)
    try {
      const backup = await createBackup(includePhotos)
      const blob = await encodeBackup(backup)
      const file = new File([blob], backupFileName(backup.manifest.createdAt), { type: blob.type })
      if ((await shareOrDownload(file)) !== 'cancelled') toast({ message: t('backup.saved') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id="save-backup" title={t('backup.saveTitle')}>
      <p className="text-muted-foreground">{t('backup.saveBody')}</p>
      <CheckboxField
        label={t('backup.includePhotos')}
        checked={includePhotos}
        onChange={(e) => setIncludePhotos(e.target.checked)}
      />
      <div>
        <Button onClick={() => void onSave()} disabled={busy}>
          <Download aria-hidden />
          {busy ? t('backup.saving') : t('backup.save')}
        </Button>
      </div>
    </Section>
  )
}

function RestoreBackup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const toast = useToast()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<Backup>()
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | undefined) => {
    setError(undefined)
    setPending(undefined)
    if (!file) return
    const result = await decodeBackup(file)
    if (result.ok) setPending(result.value)
    else setError(result.errors.file)
  }

  const onRestore = async (backup: Backup) => {
    setBusy(true)
    try {
      await restoreBackup(backup)
      toast({ message: t('backup.restored') })
      void navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const counts = pending?.manifest.rowCounts ?? {}
  return (
    <Section id="restore-backup" title={t('backup.restoreTitle')}>
      <p className="text-muted-foreground">{t('backup.restoreBody')}</p>
      <label className="flex h-12 w-fit cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-accent">
        <Upload aria-hidden className="size-4" />
        {t('backup.chooseFile')}
        <input
          type="file"
          accept=".gz,application/gzip"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      <ErrorText error={error} />
      {pending && (
        <Card className="grid gap-3 p-4" role="region" aria-label={t('backup.chosen')}>
          <p className="font-medium">
            {t('backup.from', { date: formatDateTime(pending.manifest.createdAt) })}
          </p>
          <p className="text-sm text-muted-foreground">
            {[
              t('backup.owners', { count: counts.owner ?? 0 }),
              t('backup.buildings', { count: counts.building ?? 0 }),
              t('backup.expenses', { count: counts.expense ?? 0 }),
              t('backup.readings', { count: counts.meterReading ?? 0 }),
              pending.manifest.photos
                ? t('backup.photos', { count: pending.photos.length })
                : t('backup.noPhotos'),
            ].join(' · ')}
          </p>
          <p className="text-sm font-medium text-destructive">{t('backup.replaceWarning')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setPending(undefined)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void onRestore(pending)} disabled={busy}>
              {t('backup.restore')}
            </Button>
          </div>
        </Card>
      )}
    </Section>
  )
}
