import type { Audited } from '@/domain/types'

/** The fields of a record other than id and audit fields. */
export type Fields<T extends Audited> = Omit<T, keyof Audited>

/** A new record with a random id and audit fields (AGENT.md section 6). */
export function newRecord<T extends Audited>(fields: Fields<T>, now = Date.now()): T {
  return {
    ...fields,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as T
}

/** Soft-deleted records are hidden from reads unless stated (AGENT.md 0.2 rule 5). */
export function isLive(record: { deletedAt: number | null }): boolean {
  return record.deletedAt === null
}

/** Trims optional text; an empty string is stored as null. */
export function optionalText(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}
