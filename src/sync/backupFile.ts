import { z } from 'zod'
import { db } from '@/data/db'
import { isLive } from '@/data/records'
import { LATEST_VERSION } from '@/data/schema'
import { fail, ok, type Result } from '@/domain/result'

// The backup file of AGENT.md 12.6: `{ manifest, tables, photos? }` as gzipped JSON. The same
// format goes to Google Drive in Phase 4. Usable from the page and the service worker.

const FORMAT = 'property-ledger-backup'
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'
/** Image data is not a table row: photos travel in their own list, as base64. */
const BLOB_TABLE = 'attachmentBlob'

const manifestSchema = z.object({
  format: z.literal(FORMAT),
  appVersion: z.string(),
  schemaVersion: z.number().int().positive(),
  createdAt: z.number().int(),
  rowCounts: z.record(z.string(), z.number().int().nonnegative()),
  photos: z.boolean(),
  /** SHA-256 of the JSON of `{ tables, photos }`, in hex. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
})
const photoSchema = z.object({ id: z.string().min(1), type: z.string(), data: z.string() })
const rowSchema = z.record(z.string(), z.unknown())
const fileSchema = z.object({
  manifest: manifestSchema,
  tables: z.record(z.string(), z.array(rowSchema)),
  photos: z.array(photoSchema),
})

export type BackupManifest = z.infer<typeof manifestSchema>
export type BackupPhoto = z.infer<typeof photoSchema>
export type Backup = z.infer<typeof fileSchema>

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function checksumOf(backup: Pick<Backup, 'tables' | 'photos'>): Promise<string> {
  return sha256(JSON.stringify({ tables: backup.tables, photos: backup.photos }))
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function fromBase64(photo: BackupPhoto): Blob {
  const binary = atob(photo.data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: photo.type })
}

/** The tables of the database a backup holds, every one except the image data. */
export function backupTableNames(): string[] {
  return db.tables.map((t) => t.name).filter((name) => name !== BLOB_TABLE)
}

/**
 * Reads every table in one read-only transaction and builds a backup (AGENT.md 12.3 step 3).
 * Photos of records that are not deleted are embedded when asked for.
 */
export async function createBackup(includePhotos: boolean, now = Date.now()): Promise<Backup> {
  const names = backupTableNames()
  const { tables, blobs } = await db.transaction('r', db.tables, async () => {
    const tables: Record<string, Record<string, unknown>[]> = {}
    for (const name of names) tables[name] = await db.table<Record<string, unknown>>(name).toArray()
    const live = (await db.attachment.toArray()).filter(isLive).map((a) => a.id)
    const blobs = includePhotos ? (await db.attachmentBlob.bulkGet(live)).filter((b) => !!b) : []
    return { tables, blobs }
  })
  // Blobs are read outside the transaction: awaiting them inside would end it early.
  const photos = await Promise.all(
    blobs.map(async ({ id, blob }) => ({ id, type: blob.type, data: await toBase64(blob) })),
  )
  const manifest: BackupManifest = {
    format: FORMAT,
    appVersion: APP_VERSION,
    schemaVersion: LATEST_VERSION,
    createdAt: now,
    rowCounts: Object.fromEntries(names.map((name) => [name, tables[name]?.length ?? 0])),
    photos: includePhotos,
    checksum: await checksumOf({ tables, photos }),
  }
  return { manifest, tables, photos }
}

/** A backup as a gzipped JSON file. */
export async function encodeBackup(backup: Backup): Promise<Blob> {
  const stream = new Blob([JSON.stringify(backup)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/gzip' })
}

/**
 * Opens a backup file and checks it (AGENT.md 12.4): gzip, the format, a schema version not
 * newer than the app's, known tables, the row counts and the checksum.
 */
export async function decodeBackup(file: Blob): Promise<Result<Backup>> {
  let text: string
  try {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'))
    text = await new Response(stream).text()
  } catch {
    return fail({ file: 'errors.backup.notBackup' })
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return fail({ file: 'errors.backup.notBackup' })
  }
  const parsed = fileSchema.safeParse(json)
  if (!parsed.success) return fail({ file: 'errors.backup.notBackup' })
  const backup = parsed.data
  const { manifest } = backup

  if (manifest.schemaVersion > LATEST_VERSION) return fail({ file: 'errors.backup.newerVersion' })
  const known = new Set(backupTableNames())
  if (Object.keys(backup.tables).some((name) => !known.has(name)))
    return fail({ file: 'errors.backup.newerVersion' })
  const countsMatch = Object.entries(backup.tables).every(
    ([name, rows]) => manifest.rowCounts[name] === rows.length,
  )
  if (!countsMatch || (await checksumOf(backup)) !== manifest.checksum)
    return fail({ file: 'errors.backup.damaged' })
  return ok(backup)
}

/** The backup's file name, in Asia/Dhaka time: `PropertyLedger_Backup_2026-10-15_1200.json.gz`. */
export function backupFileName(createdAt: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(createdAt)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value
  return `PropertyLedger_Backup_${part('year')}-${part('month')}-${part('day')}_${part('hour')}${part('minute')}.json.gz`
}
