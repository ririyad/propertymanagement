import { db } from '@/data/db'

export type MetaKey = 'setupCompletedAt' | 'categoriesSeededAt' | 'lastRolloverAt'

export async function getMeta<T>(key: MetaKey): Promise<T | undefined> {
  return (await db.appMeta.get(key))?.value as T | undefined
}

export async function setMeta(key: MetaKey, value: unknown): Promise<void> {
  await db.appMeta.put({ key, value })
}
