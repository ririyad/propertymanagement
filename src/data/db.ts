import { Dexie, type Table } from 'dexie'
import type {
  AppMeta,
  Attachment,
  Building,
  BuildingGroup,
  Expense,
  ExpenseAllocation,
  ExpenseCategory,
  Meter,
  MeterReading,
  Owner,
  RecurringTemplate,
  ShareEntry,
  ShareSet,
  Tariff,
} from '@/domain/types'
import { declareSchema } from './schema'

/** Image data of an attachment, kept apart so list queries never load it (AGENT.md 7.6). */
export interface AttachmentBlob {
  id: string
  blob: Blob
}

export const DB_NAME = 'property-ledger'

export class LedgerDb extends Dexie {
  declare owner: Table<Owner, string>
  declare buildingGroup: Table<BuildingGroup, string>
  declare building: Table<Building, string>
  declare shareSet: Table<ShareSet, string>
  declare shareEntry: Table<ShareEntry, string>
  declare meter: Table<Meter, string>
  declare tariff: Table<Tariff, string>
  declare meterReading: Table<MeterReading, string>
  declare expenseCategory: Table<ExpenseCategory, string>
  declare recurringTemplate: Table<RecurringTemplate, string>
  declare expense: Table<Expense, string>
  declare expenseAllocation: Table<ExpenseAllocation, string>
  declare attachment: Table<Attachment, string>
  declare attachmentBlob: Table<AttachmentBlob, string>
  declare appMeta: Table<AppMeta, string>

  constructor(name = DB_NAME) {
    super(name)
    declareSchema(this)
  }
}

export const db = new LedgerDb()
