import { db } from '@/data/db'
import { isLive } from '@/data/records'
import type { MeterReading } from '@/domain/types'

/** A meter's readings, oldest month first. */
export async function listReadings(meterId: string): Promise<MeterReading[]> {
  const readings = await db.meterReading.where('meterId').equals(meterId).toArray()
  return readings.filter(isLive).sort((a, b) => a.period.localeCompare(b.period))
}
