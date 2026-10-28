// Records of the Phase 1 tables (AGENT.md 7.1, 7.3, 7.4, 7.6). Field names match the Dexie tables.
import type { Bp } from '@/domain/bp'
import type { Poisha } from '@/domain/money'
import type { IsoDate, Period } from '@/domain/period'
import type { BillBreakdown } from '@/domain/tariff'

/** Epoch milliseconds. */
export type Instant = number

/** Indexed booleans are stored as 0 or 1, because IndexedDB cannot index booleans. */
export type IndexedBoolean = 0 | 1

export interface Audited {
  id: string
  createdAt: Instant
  updatedAt: Instant
  deletedAt: Instant | null
}

// 7.1 Ownership

export interface Owner extends Audited {
  name: string
  phone: string | null
  relation: string | null
  note: string | null
  isPrimary: boolean
  sortOrder: number
}

export interface BuildingGroup extends Audited {
  name: string
}

export interface Building extends Audited {
  name: string
  address: string | null
  note: string | null
  groupId: string | null
  sortOrder: number
}

export type ShareMethod = 'MANUAL' | 'ISLAMIC' | 'OTHER'

export interface ShareSet extends Audited {
  buildingId: string
  effectiveFrom: Period
  method: ShareMethod
  methodNote: string | null
}

export interface ShareEntry extends Audited {
  shareSetId: string
  ownerId: string
  bp: Bp
}

// 7.3 Meters and tariffs

export type MeterType = 'POSTPAID' | 'PREPAID' | 'SUB'
export type MeterScope = 'COMMON' | 'FLAT'
export type MeterPayer = 'OWNERS' | 'TENANT'

export interface Meter extends Audited {
  buildingId: string
  label: string
  meterNo: string | null
  type: MeterType
  scope: MeterScope
  flatId: string | null
  payer: MeterPayer
  parentMeterId: string | null
  categoryId: string
  isActive: boolean
}

export type TariffMode = 'FLAT' | 'SLAB'
export type SlabMode = 'PROGRESSIVE' | 'SINGLE_BAND'

export interface Slab {
  /** Cumulative inclusive upper bound; `null` only on the last slab. */
  upToUnits: number | null
  /** Poisha per unit. */
  rate: number
}

export interface Tariff extends Audited {
  meterId: string
  effectiveFrom: Period
  mode: TariffMode
  /** Poisha per unit, for `FLAT`. */
  flatRate: number | null
  slabMode: SlabMode | null
  slabs: Slab[]
  fixedChargeMonthly: Poisha
  vatBp: Bp
  vatOnFixed: boolean
}

export interface MeterReading extends Audited {
  meterId: string
  period: Period
  readingUnits: number
  isReset: boolean
  readOn: IsoDate
  unitsUsed: number | null
  billAmount: Poisha | null
  billBreakdown: BillBreakdown | null
}

// 7.4 Expenses

export type CategoryKind = 'METER' | 'RECURRING' | 'ONE_OFF'

export type SplitRule =
  'BY_SHARE' | 'SINGLE_OWNER' | 'EQUAL' | 'CUSTOM_PERCENT' | 'CUSTOM_AMOUNT' | 'TENANT_PAID'

export interface ExpenseCategory extends Audited {
  name: string
  kind: CategoryKind
  defaultSplitRule: SplitRule
  isSystem: boolean
  isHidden: boolean
  sortOrder: number
}

export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export interface RecurringTemplate extends Audited {
  buildingId: string
  categoryId: string
  amount: Poisha
  frequency: Frequency
  startPeriod: Period
  endPeriod: Period | null
  dueDay: number
  defaultPaidByOwnerId: string | null
  splitRule: SplitRule
  isActive: IndexedBoolean
  note: string | null
}

export type ExpenseStatus = 'DRAFT' | 'CONFIRMED' | 'SKIPPED'

export type ExpenseSource =
  'MANUAL' | 'RECURRING' | 'METER_POSTPAID' | 'METER_PREPAID' | 'METER_SUB'

/** A custom split input: bp for `CUSTOM_PERCENT`, poisha for `CUSTOM_AMOUNT`. */
export interface SplitInput {
  ownerId: string
  value: number
}

export interface Expense extends Audited {
  buildingId: string
  categoryId: string
  meterId: string | null
  templateId: string | null
  readingId: string | null
  period: Period
  date: IsoDate
  dueDate: IsoDate | null
  amount: Poisha
  units: number | null
  status: ExpenseStatus
  source: ExpenseSource
  isPaid: boolean
  paidByOwnerId: string | null
  splitRule: SplitRule
  singleOwnerId: string | null
  splitInputs: SplitInput[] | null
  note: string | null
}

export interface ExpenseAllocation extends Audited {
  expenseId: string
  ownerId: string
  amount: Poisha
}

// 7.6 Attachments and metadata (attachment_blob holds a Blob, so its type lives in src/data/db.ts)

export type AttachmentRecordType = 'EXPENSE' | 'READING' | 'PAYMENT' | 'TENANT' | 'LEASE'

export interface Attachment extends Audited {
  recordType: AttachmentRecordType
  recordId: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
  driveFileId: string | null
  position: 0 | 1
}

export interface AppMeta {
  key: string
  value: unknown
}
